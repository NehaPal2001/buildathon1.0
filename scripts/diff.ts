import { git, resolveBranch, findBase } from './lib/git';
import { findSuiteDir } from './lib/suite-dir';
import { parseArgs, writeJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { DiffSchema, type ChangedFile, type Diff, type Hunk } from './schema';

const USAGE = 'usage: diff.ts --repo <dir> --branch <name> [--suite <dir>] --out <file>';

const IGNORED = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
  /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|pdf|zip)$/i,
  /\.md$/i,
  /\.(test|spec)\.[jt]sx?$/,
  /(^|\/)node_modules\//,
];
const CONTRACT = /(openapi|swagger)[^/]*\.(ya?ml|json)$/i;

export function isBehaviourFile(file: string, suiteDir: string | null): boolean {
  if (suiteDir && file.startsWith(suiteDir + '/')) return false;
  return !IGNORED.some((re) => re.test(file));
}

/** Parse `git diff -U0` output into files with added-line hunks. */
export function parseUnifiedDiff(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | null = null;
  let hunk: Hunk | null = null;
  for (const line of text.split('\n')) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      current = { file: header[2], status: 'M', hunks: [] };
      files.push(current);
      hunk = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('--- /dev/null')) { current.status = 'A'; continue; }
    if (line.startsWith('+++ /dev/null')) { current.status = 'D'; continue; }
    const at = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (at) {
      hunk = { newStart: Number(at[1]), newLines: at[2] === undefined ? 1 : Number(at[2]), lines: [] };
      current.hunks.push(hunk);
      continue;
    }
    if (hunk && line.startsWith('+')) hunk.lines.push(line.slice(1));
  }
  return files;
}

export function computeDiff(repo: string, branchQuery: string, explicitSuite?: string): Diff {
  const branch = resolveBranch(repo, branchQuery);
  const base = findBase(repo);
  const mergeBase = git(repo, ['merge-base', base, branch]);
  const suiteDir = findSuiteDir(repo, branch, explicitSuite);

  const raw = git(repo, ['diff', '-U0', '--no-color', '--no-renames', mergeBase, branch, '--']);
  const files = parseUnifiedDiff(raw).filter((f) => isBehaviourFile(f.file, suiteDir));

  const log = git(repo, ['log', '--format=%H%x00%s%x00%b%x1e', `${mergeBase}..${branch}`]);
  const commits = log
    .split('\x1e')
    .map((s) => s.replace(/^\n/, ''))
    .filter((s) => s.trim())
    .map((entry) => {
      const [sha, subject, body = ''] = entry.split('\x00');
      return { sha, subject, body: body.trim() };
    });

  const contractFiles = files.filter((f) => CONTRACT.test(f.file)).map((f) => f.file);
  return DiffSchema.parse({ branch, base, mergeBase, suiteDir, files, commits, contractFiles });
}

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.repo || !args.branch || !args.out) fail(USAGE);
  try {
    const branch = resolveBranch(args.repo, args.branch);
    writeJson(args.out, computeDiff(args.repo, branch, args.suite));
  } catch (err) {
    const e = err as Error & { matches?: string[] };
    fail(e.matches ? `${e.message} — candidates: ${JSON.stringify(e.matches)}` : formatError(err));
  }
}
