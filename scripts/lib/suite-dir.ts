import { listFiles } from './git';

const CANDIDATE_DIRS = ['e2e', 'tests', 'playwright', 'test'];

export function isSpecFile(file: string): boolean {
  return /\.spec\.[jt]sx?$/.test(file);
}

/** Directory holding the Playwright suite at `ref`, relative to the repo root. */
export function findSuiteDir(cwd: string, ref: string, explicit?: string): string | null {
  if (explicit) return explicit.replace(/\/+$/, '');
  const files = listFiles(cwd, ref);
  for (const dir of CANDIDATE_DIRS) {
    if (files.some((f) => f.startsWith(dir + '/') && isSpecFile(f))) return dir;
  }
  return null;
}
