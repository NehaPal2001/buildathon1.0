import { execFileSync } from 'node:child_process';

export function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).replace(/\n$/, '');
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`git ${args.join(' ')} failed: ${(e.stderr ?? e.message).trim()}`);
  }
}

/** File contents at a ref, or null if it does not exist there. */
export function showFile(cwd: string, ref: string, file: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function listFiles(cwd: string, ref: string): string[] {
  return git(cwd, ['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);
}

export class BranchResolutionError extends Error {
  constructor(readonly query: string, readonly matches: string[]) {
    super(
      matches.length === 0
        ? `No branch matches "${query}"`
        : `Ambiguous branch "${query}": ${matches.join(', ')}`,
    );
  }
}

function localBranches(cwd: string): string[] {
  return git(cwd, ['branch', '--list', '--format=%(refname:short)']).split('\n').filter(Boolean);
}

/** Exact branch name, else the unique branch containing the query (e.g. a ticket id). */
export function resolveBranch(cwd: string, query: string): string {
  const all = localBranches(cwd);
  if (all.includes(query)) return query;
  const matches = all.filter((b) => b.includes(query));
  if (matches.length === 1) return matches[0];
  throw new BranchResolutionError(query, matches);
}

export function findBase(cwd: string): string {
  const all = localBranches(cwd);
  for (const name of ['main', 'master']) if (all.includes(name)) return name;
  try {
    return git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  } catch {
    throw new Error('Cannot determine base branch: no main, master, or origin/HEAD');
  }
}
