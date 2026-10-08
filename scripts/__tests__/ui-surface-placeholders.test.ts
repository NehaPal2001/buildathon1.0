import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { extractUi } from '../ui-surface';
import { makeRepo } from './make-repo';

/**
 * End-to-end coverage for `placeholderRanges()` in `scripts/ui-surface.ts`: proves the
 * AST-derived masking survives the real pipeline (real TS parsing, real git repo),
 * not just the hand-supplied ranges exercised directly against `extractElements` in
 * `html.test.ts`. Each of these is a case a text-based brace/quote scanner gets
 * wrong (the class of bug findings 1 and its round-2 follow-up were raised over).
 */

const repos: string[] = [];
function repo(files: Record<string, string>): string {
  const dir = makeRepo(files);
  repos.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ui-surface: AST-derived placeholder masking end-to-end', () => {
  it("reviewer's repro through real TS parsing: a } and a \" both inside ${} do not manufacture attributes", () => {
    const dir = repo({
      'src/routes/widgets.ts': [
        "import { Router } from 'express';",
        'export const r = Router();',
        "r.get('/widgets', (req, res) => {",
        '  const x: Record<string, string> = {};',
        '  res.send(`<button data-testid="pre-${x[\'}\'] + \'"Q"\'}-post" name="after"></button>`);',
        '});',
      ].join('\n'),
    });
    const ui = extractUi(dir, 'main', null);
    const btn = ui.surface.find((e) => e.element === 'button')!;
    expect(btn).toBeDefined();
    expect(btn.attrs['data-testid']).toBe('pre-${x[\'}\'] + \'"Q"\'}-post');
    expect(btn.attrs.name).toBe('after');
    expect(btn.attrs).not.toHaveProperty('q');
    expect(btn.attrs).not.toHaveProperty('-post');
    expect(Object.keys(btn.attrs).sort()).toEqual(['data-testid', 'name']);
  });

  it('a lone } inside a string inside ${} does not manufacture attributes', () => {
    const dir = repo({
      'src/routes/widgets.ts': [
        "import { Router } from 'express';",
        'export const r = Router();',
        "r.get('/widgets', (req, res) => {",
        "  const x: Record<string, string> = {};",
        '  res.send(`<input data-testid="${x[\'}\']}" name="q2">`);',
        '});',
      ].join('\n'),
    });
    const ui = extractUi(dir, 'main', null);
    const input = ui.surface.find((e) => e.element === 'input')!;
    expect(input).toBeDefined();
    expect(input.attrs['data-testid']).toBe("${x['}']}");
    expect(input.attrs.name).toBe('q2');
    expect(Object.keys(input.attrs).sort()).toEqual(['data-testid', 'name']);
  });

  it('a nested template literal inside an expression is preserved verbatim, not double-counted', () => {
    const dir = repo({
      'src/routes/widgets.ts': [
        "import { Router } from 'express';",
        'export const r = Router();',
        "const cond = true; const b = 'x';",
        "r.get('/widgets', (req, res) => {",
        "  res.send(`<button data-testid=\"v-${cond ? `n${b}` : 'z'}\">Go</button>`);",
        '});',
      ].join('\n'),
    });
    const ui = extractUi(dir, 'main', null);
    const buttons = ui.surface.filter((e) => e.element === 'button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].attrs['data-testid']).toBe("v-${cond ? `n${b}` : 'z'}");
  });

  it('degrades safely on a genuinely malformed/truncated source file: no throw, no manufactured surface', () => {
    const dir = repo({
      // Deliberately broken: unterminated template literal and unterminated arrow
      // function, simulating a WIP edit or bad merge left in a branch under test.
      'src/routes/broken.ts': [
        "import { Router } from 'express';",
        'export const r = Router();',
        "r.get('/broken', (req, res) => {",
        '  res.send(`<div><button data-testid="pre-${a',
      ].join('\n'),
      'src/routes/ok.ts': [
        "import { Router } from 'express';",
        'export const ok = Router();',
        "ok.get('/ok', (req, res) => { res.send(`<a href=\"/x\" data-testid=\"link\">x</a>`); });",
      ].join('\n'),
    });
    let ui: ReturnType<typeof extractUi> | undefined;
    expect(() => {
      ui = extractUi(dir, 'main', null);
    }).not.toThrow();
    // The well-formed sibling file must still extract correctly — one bad file must
    // not poison the whole run.
    expect(ui!.routes.map((r) => `${r.method} ${r.path}`)).toContain('GET /ok');
    expect(ui!.surface.some((e) => e.attrs['data-testid'] === 'link')).toBe(true);
    // Nothing from the broken file's dangling text should surface as a fabricated element.
    for (const e of ui!.surface) {
      for (const key of Object.keys(e.attrs)) {
        expect(key).not.toBe('a');
      }
    }
  });
});
