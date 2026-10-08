import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const FIXTURE = path.join(os.tmpdir(), 'recon-fixture-test');
export const FEATURE = 'feature/PROJ-4821';

// Kept as a sibling of the fixture dir, not inside it: setup.sh does `git
// init` + commit-everything in the target, so a stamp file inside would show
// up as an untracked file in the fixture repo and could confuse diff/status
// based tests running against it.
const STAMP = FIXTURE + '.stamp';

function sourceHash(): string {
  const root = path.resolve(__dirname, '../../fixtures');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      e.isDirectory() ? walk(p) : files.push(p + ':' + fs.readFileSync(p));
    }
  };
  walk(root);
  return createHash('sha256').update(files.join('\0')).digest('hex');
}

export function ensureFixture(): string {
  const hash = sourceHash();
  const stale = !fs.existsSync(path.join(FIXTURE, '.git')) ||
    !fs.existsSync(STAMP) ||
    fs.readFileSync(STAMP, 'utf8') !== hash;
  if (stale) {
    const setup = path.resolve(__dirname, '../../fixtures/setup.sh');
    execFileSync('bash', [setup, FIXTURE], { stdio: 'ignore' });
    fs.writeFileSync(STAMP, hash);
  }
  return FIXTURE;
}
