import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { extractUi } from '../ui-surface';
import { makeRepo } from './make-repo';

const repos: string[] = [];
function repo(files: Record<string, string>): string {
  const dir = makeRepo(files);
  repos.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ui-surface: express route-detection edge cases', () => {
  it('finds both verbs on a router.route(path).verb(fn).verb(fn) chain', () => {
    const dir = repo({
      'src/routes/widgets.ts': `
        import { Router } from 'express';
        export const widgetsRouter = Router();
        widgetsRouter.route('/widgets').get((req, res) => { res.send('list'); }).post((req, res) => { res.send('made'); });
      `,
      'src/app.ts': `
        import express from 'express';
        import { widgetsRouter } from './routes/widgets';
        export function createApp() {
          const app = express();
          app.use(widgetsRouter);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const keys = ui.routes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toEqual(expect.arrayContaining(['GET /widgets', 'POST /widgets']));
    expect(ui.routes.filter((r) => r.path === '/widgets')).toHaveLength(2);
  });

  it('applies the mount prefix to a chained route', () => {
    const dir = repo({
      'src/routes/widgets.ts': `
        import { Router } from 'express';
        export const widgetsRouter = Router();
        widgetsRouter.route('/list').get((req, res) => { res.send('list'); });
      `,
      'src/app.ts': `
        import express from 'express';
        import { widgetsRouter } from './routes/widgets';
        export function createApp() {
          const app = express();
          app.use('/api/widgets', widgetsRouter);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    expect(ui.routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /api/widgets/list');
  });

  it('resolves a renamed Router import (import { Router as R })', () => {
    const dir = repo({
      'src/routes/r.ts': `
        import { Router as R } from 'express';
        export const r = R();
        r.get('/x', (req, res) => { res.send('x'); });
      `,
      'src/app.ts': `
        import express from 'express';
        import { r } from './routes/r';
        export function createApp() {
          const app = express();
          app.use(r);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    expect(ui.routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /x');
  });

  it('resolves an app instance not named "app", created from an aliased default import', () => {
    const dir = repo({
      'src/server.ts': `
        import ex from 'express';
        const server = ex();
        server.get('/y', (req, res) => { res.send('y'); });
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const y = ui.routes.find((r) => r.path === '/y');
    expect(y).toBeDefined();
    expect(y?.method).toBe('GET');
    expect(y?.file).toBe('src/server.ts');
  });

  it('resolves both express.Router() and express() under a namespace import (import * as express)', () => {
    const dir = repo({
      'src/routes/ns.ts': `
        import * as express from 'express';
        export const r = express.Router();
        r.get('/ns', (req, res) => { res.send('ns'); });
      `,
      'src/direct.ts': `
        import * as express from 'express';
        const srv = express();
        srv.get('/ns-direct', (req, res) => { res.send('direct'); });
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const keys = ui.routes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /ns');
    expect(keys).toContain('GET /ns-direct');
  });
});

describe('ui-surface: mount-prefix tracking (I1)', () => {
  it('applies the prefix when the router is declared AND mounted in the same file', () => {
    const dir = repo({
      'src/app.ts': `
        import express from 'express';
        export function createApp() {
          const app = express();
          const api = express.Router();
          api.get('/things', (req, res) => { res.send('things'); });
          app.use('/api/v1', api);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const keys = ui.routes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /api/v1/things');
    expect(keys).not.toContain('GET /things');
  });

  it('keeps every prefix a single router is mounted under, instead of only the last', () => {
    const dir = repo({
      'src/routes/shared.ts': `
        import { Router } from 'express';
        export const sharedRouter = Router();
        sharedRouter.get('/x', (req, res) => { res.send('x'); });
      `,
      'src/app.ts': `
        import express from 'express';
        import { sharedRouter } from './routes/shared';
        export function createApp() {
          const app = express();
          app.use('/api', sharedRouter);
          app.use('/admin', sharedRouter);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const keys = ui.routes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /api/x');
    expect(keys).toContain('GET /admin/x');
  });

  it('does not let one router mounted at /B leak its prefix onto a sibling router mounted at /A', () => {
    // Two DISTINCT routers declared in the same file, mounted at two different prefixes. Keying
    // mounts by file alone (rather than by router identity) collapsed both onto whichever
    // app.use call was seen last, fabricating a path ('/B/alpha') the app never actually serves.
    const dir = repo({
      'src/routes/both.ts': `
        import { Router } from 'express';
        export const aRouter = Router();
        export const bRouter = Router();
        aRouter.get('/alpha', (req, res) => { res.send('alpha'); });
        bRouter.get('/beta', (req, res) => { res.send('beta'); });
      `,
      'src/app.ts': `
        import express from 'express';
        import { aRouter, bRouter } from './routes/both';
        export function createApp() {
          const app = express();
          app.use('/A', aRouter);
          app.use('/B', bRouter);
          return app;
        }
      `,
    });
    const ui = extractUi(dir, 'main', null);
    const keys = ui.routes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toContain('GET /A/alpha');
    expect(keys).toContain('GET /B/beta');
    expect(keys).not.toContain('GET /B/alpha');
    expect(keys).not.toContain('GET /A/beta');
  });
});

describe('ui-surface: I4 — a pathological file does not poison the whole run', () => {
  it('records an unparseable file (stack-overflowing || chain) as unparsed and still finds routes elsewhere', () => {
    // Same class of input as the review's example (a 5,000-term `||` chain / 2,000 nested
    // `if`s): parses fine, but a plain recursive `walk` over the resulting AST reliably blows
    // the stack. `ui-surface` walks every app file, so this is the most exposed extractor.
    const term = Array.from({ length: 5000 }, (_, i) => `x${i}`).join(' || ');
    const dir = repo({
      'src/bad.ts': `export const bad = ${term};\n`,
      'src/routes/ok.ts': `
        import { Router } from 'express';
        export const okRouter = Router();
        okRouter.get('/ok', (req, res) => { res.send('ok'); });
      `,
    });
    let ui: ReturnType<typeof extractUi> | undefined;
    expect(() => {
      ui = extractUi(dir, 'main', null);
    }).not.toThrow();
    expect(ui!.unparsed).toEqual(['src/bad.ts']);
    expect(ui!.routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /ok');
  });
});
