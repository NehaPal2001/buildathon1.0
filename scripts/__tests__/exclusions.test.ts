import { describe, it, expect } from 'vitest';
import { parseExclusions, globToRegex, applyExclusions } from '../lib/exclusions';
import type { State } from '../schema';

const md = `# Suite conventions
stuff

## Exclusions

<!-- ignore states from <glob> -->
- ignore states from src/legacy/**
- ignore states whose origin is a logging or telemetry branch
- treat src/shared/money.ts as always in regression scope
- please skip flaky ones
`;

function state(id: string, file: string, note?: string): State {
  return {
    id, description: 'x', confidence: 'high', inClaim: false, coveredBy: [],
    origins: [{ candidateId: 'c-1', file, line: 1, excerpt: 'if (x)', source: 'code' }],
    reachability: { kind: 'api', setup: 'POST /x', evidence: 'route POST /x' },
    ...(note ? { exclusionNote: note } : {}),
  };
}

describe('exclusions', () => {
  it('parses the three forms and reports the rest', () => {
    expect(parseExclusions(md)).toEqual({
      ignoreGlobs: ['src/legacy/**'],
      ignoreOrigins: ['a logging or telemetry branch'],
      alwaysInScope: ['src/shared/money.ts'],
      unrecognised: ['please skip flaky ones'],
    });
  });

  it('ignores everything above the heading and html comments', () => {
    expect(parseExclusions('- ignore states from src/**\n## Exclusions\n<!-- ignore states from x -->\n')).toEqual({
      ignoreGlobs: [], ignoreOrigins: [], alwaysInScope: [], unrecognised: [],
    });
  });

  it('matches globs', () => {
    expect(globToRegex('src/legacy/**').test('src/legacy/a/b.ts')).toBe(true);
    expect(globToRegex('src/legacy/**').test('src/legacyx/b.ts')).toBe(false);
    expect(globToRegex('src/*.ts').test('src/a.ts')).toBe(true);
    expect(globToRegex('src/*.ts').test('src/a/b.ts')).toBe(false);
  });

  it('drops states whose every origin matches a glob, or that carry an exclusionNote', () => {
    const ex = parseExclusions(md);
    const result = applyExclusions([state('a', 'src/legacy/old.ts'), state('b', 'src/new.ts'), state('c', 'src/new.ts', 'logging branch')], ex);
    expect(result.kept.map((s) => s.id)).toEqual(['b']);
    expect(result.suppressed).toBe(2);
  });
});
