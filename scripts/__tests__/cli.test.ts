import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'recon-cli-test-out.json');
// Each case spawns a real tsx subprocess; a cold transform costs ~30s on a slow
// filesystem (observed on Windows), so this budget is spawn cost, not test work.
const TIMEOUT = 60000;

// tsx's CLI is run through `process.execPath` rather than `npx`: on Windows `npx` is a
// .cmd shim, which execFileSync refuses to spawn without a shell, so `npx` here would be
// ENOENT on every case and report as 'exit 1, empty stderr' instead of a real result.
const TSX = require.resolve('tsx/cli');

// Minimal, self-contained fixtures for validate.ts's CLI — deliberately not the real extracted
// fixture (candidates.ts/diff.ts already exercise that elsewhere): just enough JSON to satisfy
// CandidatesSchema/AnalysisSchema so the "invalid analysis" path can be reached without a git
// repo, keeping this test as fast/isolated as its siblings above.
const VALIDATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-validate-cli-'));
const MINIMAL_CANDIDATES = path.join(VALIDATE_DIR, 'candidates.json');
const BAD_ANALYSIS = path.join(VALIDATE_DIR, 'bad-analysis.json');
fs.writeFileSync(MINIMAL_CANDIDATES, JSON.stringify({ branch: 'main', candidates: [], contractChanges: [], unparsed: [] }));
fs.writeFileSync(BAD_ANALYSIS, JSON.stringify({
  version: 2,
  branch: 'main',
  base: 'main',
  generatedAt: '2026-09-22T00:00:00.000Z',
  candidatesTotal: 0,
  claim: { source: 'none', text: '' },
  behaviourChanges: [],
  mismatches: [],
  states: [{
    id: 'example-state',
    description: 'An example state for CLI testing.',
    origins: [{ candidateId: 'c-9999', file: 'src/x.ts', line: 1, excerpt: 'if (x)', source: 'code' }],
    reachability: { kind: 'api', setup: 'POST /x', evidence: 'route POST /x' },
    inClaim: false,
    coveredBy: [],
    confidence: 'high',
  }],
}));

interface Result {
  status: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[]): Result {
  try {
    const stdout = execFileSync(process.execPath, [TSX, path.join(ROOT, script), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status: number | null; stdout: string; stderr: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// (script, args that should hit a caught runtime error, not just the missing-arg usage check)
const BAD_INPUT_CASES: Array<[string, string[]]> = [
  ['diff.ts', ['--repo', '/definitely/not/a/repo/xyz', '--branch', 'main', '--out', OUT]],
  ['candidates.ts', ['--repo', '/definitely/not/a/repo/xyz', '--diff', '/definitely/not/a/diff.json', '--out', OUT]],
  ['ui-surface.ts', ['--repo', '/definitely/not/a/repo/xyz', '--branch', 'main', '--out', OUT]],
  ['suite-facts.ts', ['--repo', '/definitely/not/a/repo/xyz', '--branch', 'main', '--suite', 'e2e', '--out', OUT]],
  ['validate.ts', ['--analysis', '/definitely/not/a/file.json', '--candidates', '/definitely/not/a/candidates.json']],
  ['render.ts', ['--analysis', '/definitely/not/a/file.json', '--out-dir', OUT]],
  ['verify.ts', ['--milestone', '2']],
];

describe('CLI error handling (I6): every extractor fails with exactly one line on stderr', () => {
  it.each(BAD_INPUT_CASES)('%s exits 1 with one line on stderr for bad input', (script, args) => {
    const { status, stderr } = run(script, args);
    expect(status).toBe(1);
    expect(stderr.trim().length).toBeGreaterThan(0);
    // "one line" tolerates a single trailing newline from `fail()`; it must never be a stack
    // trace or a dumped ZodError with per-issue lines.
    expect(stderr.trim().split('\n')).toHaveLength(1);
  }, TIMEOUT);
});

const HELP_CASES: Array<[string, string]> = [
  ['diff.ts', 'diff.ts'],
  ['candidates.ts', 'candidates.ts'],
  ['ui-surface.ts', 'ui-surface.ts'],
  ['suite-facts.ts', 'suite-facts.ts'],
  ['conventions.ts', 'conventions.ts'],
  ['validate.ts', 'validate.ts'],
  ['render.ts', 'render.ts'],
  ['verify.ts', 'verify.ts'],
];

describe('CLI --help (I7): usage on stdout, exit 0', () => {
  it.each(HELP_CASES)('%s --help exits 0 and prints usage to stdout', (script, usageSubstring) => {
    const { status, stdout, stderr } = run(script, ['--help']);
    expect(status).toBe(0);
    expect(stdout).toContain(usageSubstring);
    expect(stderr).toBe('');
  }, TIMEOUT);
});

describe('validate.ts CLI: an invalid analysis is still a reported result, not a crash', () => {
  it('exits 1 with a JSON error array on stdout (not routed through the new try/catch as a crash) and nothing on stderr', () => {
    const { status, stdout, stderr } = run('validate.ts', ['--analysis', BAD_ANALYSIS, '--candidates', MINIMAL_CANDIDATES]);
    expect(status).toBe(1);
    expect(stderr).toBe('');
    const errors = JSON.parse(stdout);
    expect(errors[0]).toMatchObject({ where: 'states[0].origins[0]' });
  }, TIMEOUT);
});

describe('CLI --branch (I7): accepts the same ticket-id form diff.ts does', () => {
  it('ui-surface.ts and suite-facts.ts resolve --branch through resolveBranch, not a raw git ref', () => {
    // Regression for the concrete bug: `--branch PROJ-4821` used to fail with
    // "fatal: Not a valid object name" from ui-surface.ts/suite-facts.ts because the raw
    // ticket-id string was passed straight to git instead of through resolveBranch first.
    // A nonexistent repo can't prove success end-to-end (covered by the fixture-based
    // extract-all.sh run instead); this asserts the failure mode is "no branch matches",
    // never git's raw object-name error, which would mean resolution never ran.
    for (const script of ['ui-surface.ts', 'suite-facts.ts']) {
      const args = script === 'suite-facts.ts'
        ? ['--repo', '/definitely/not/a/repo/xyz', '--branch', 'PROJ-4821', '--suite', 'e2e', '--out', OUT]
        : ['--repo', '/definitely/not/a/repo/xyz', '--branch', 'PROJ-4821', '--out', OUT];
      const { stderr } = run(script, args);
      expect(stderr).not.toContain('Not a valid object name');
    }
  }, TIMEOUT);
});
