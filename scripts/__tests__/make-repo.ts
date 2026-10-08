import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** A throwaway one-commit git repo on `main`, built from an in-memory file map. */
export function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-surface-edge-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const git = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['add', '-A']);
  git(['-c', 'user.name=t', '-c', 'user.email=t@t.com', 'commit', '-q', '-m', 'init']);
  return dir;
}
