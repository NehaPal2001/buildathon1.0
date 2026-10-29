import { describe, it, expect, beforeAll } from 'vitest';
import { FIXTURE } from './fixture';
import { computeDiff } from '../diff';
import { extractCandidates } from '../candidates';
import { renderBrief, briefFileName } from '../render';
import { sampleAnalysis } from './sample-analysis';
import type { Analysis } from '../schema';

let a: Analysis;
beforeAll(async () => {
  a = sampleAnalysis(await extractCandidates(FIXTURE, computeDiff(FIXTURE, 'PROJ-4821')));
});

describe('renderBrief', () => {
  it('keeps the fixed section order and ends with scope', () => {
    const { terminal } = renderBrief(a);
    const order = ['COVER —', 'WHAT ACTUALLY CHANGED', 'SPEC vs IMPLEMENTATION', 'REACHABLE STATES', 'QUESTIONS FOR THE DEV', 'REGRESSION SCOPE'];
    const positions = order.map((h) => terminal.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    expect(terminal.trimEnd().split('\n').slice(-3).join('\n')).toContain('REGRESSION SCOPE');
  });

  it('cites file and line for every finding', () => {
    const { terminal } = renderBrief(a);
    expect(terminal).toMatch(/src\/services\/coupon\.ts:\d+/);
    expect(terminal).toMatch(/api\/openapi\.yaml:\d+/);
  });

  it('has no ANSI codes in either output', () => {
    const { terminal, markdown } = renderBrief(a);
    expect(terminal).not.toMatch(/\x1b\[/);
    expect(markdown).not.toMatch(/\x1b\[/);
  });

  it('says scope was not computed when absent, and prints counts when present', () => {
    expect(renderBrief(a).terminal).toContain('not computed');
    const withScope: Analysis = {
      ...a,
      scope: { totalTests: 42, newTests: 2, inScope: [{ spec: 'e2e/specs/coupon.spec.ts', reason: 'visits /checkout', facts: ['/checkout'] }], outOfScope: [{ spec: 'e2e/specs/search.spec.ts', reason: 'only visits /search', facts: ['/search'] }] },
    };
    const { terminal, markdown } = renderBrief(withScope);
    expect(terminal).toContain('1 in scope');
    expect(terminal).toContain('1 out');
    expect(terminal).toContain('+ 2 new');
    expect(markdown).toContain('| e2e/specs/search.spec.ts | out | only visits /search |');
  });

  it('says scope was not computed, without claiming no suite was found', () => {
    const { terminal, markdown } = renderBrief(a);
    // An absent `scope` means this milestone produced no coverage or scope, not that the repo
    // has no suite — `Analysis` carries no suite directory to justify that claim. Mirrors
    // render-html.test.ts so both renderers are held to the same wording.
    expect(terminal).not.toMatch(/no Playwright suite was found/i);
    expect(markdown).not.toMatch(/no Playwright suite was found/i);
    expect(terminal).toContain('not produced by this milestone');
    expect(terminal).toContain('do not read that column as a coverage result');
  });

  it('reports suppressed and unrecognised exclusions', () => {
    const { terminal } = renderBrief({ ...a, suppressed: 2, exclusions: { recognised: ['ignore states from src/legacy/**'], unrecognised: ['skip flaky'] } });
    expect(terminal).toContain('2 states suppressed');
    expect(terminal).toContain('unrecognised exclusion: skip flaky');
  });

  it('names the markdown file by date and branch slug', () => {
    expect(briefFileName(a)).toBe('2026-09-22-feature-proj-4821.md');
  });

  it('marks unreachable states as questions, not tests', () => {
    const { terminal } = renderBrief(a);
    const q = terminal.slice(terminal.indexOf('QUESTIONS FOR THE DEV'), terminal.indexOf('REGRESSION SCOPE'));
    expect(q).toContain('buy-one-get-one');
  });
});

// --- `unparsed` extension (M2 ruling, applied during T3): schema.ts's `Analysis.unparsed`
// mirrors the `unparsed` field M1's extractors carry on candidates.json/ui.json/suite.json —
// files that could not be parsed/walked, so no findings were silently dropped from them, they
// were simply never read. validate.ts copies it through mechanically; render.ts is the one
// place that honesty guarantee must reach a tester actually reading the brief. ---
describe('renderBrief — unparsed', () => {
  it("says nothing extra when file/ui/suite are all empty (the real fixture's current state)", () => {
    expect(a.unparsed).toEqual({ file: [], ui: [], suite: [] }); // sanity: this is what the fixture actually produces
    const { terminal, markdown } = renderBrief(a);
    expect(terminal).not.toMatch(/could not be read/);
    expect(markdown).not.toMatch(/could not be read/);
  });

  it('names how many files in which category could not be read, without disturbing the fixed section order', () => {
    const withUnparsed: Analysis = {
      ...a,
      unparsed: { file: ['src/weird/unparseable.ts'], ui: [], suite: ['e2e/pages/Broken.ts'] },
    };
    const { terminal, markdown } = renderBrief(withUnparsed);

    expect(terminal).toMatch(/2 files could not be read/);
    expect(terminal).toContain('1 source file');
    expect(terminal).toContain('1 test suite file');
    expect(terminal).toContain('not reflected below');
    expect(terminal).toContain('src/weird/unparseable.ts');
    expect(terminal).toContain('e2e/pages/Broken.ts');
    expect(markdown).toMatch(/2 files could not be read/);

    // A candidate spot from the task brief's own extension note: after the cover header,
    // before "WHAT ACTUALLY CHANGED" — and the fixed section order must still hold.
    const noteAt = terminal.indexOf('could not be read');
    expect(noteAt).toBeGreaterThan(terminal.indexOf('COVER —'));
    expect(noteAt).toBeLessThan(terminal.indexOf('WHAT ACTUALLY CHANGED'));

    const order = ['COVER —', 'WHAT ACTUALLY CHANGED', 'SPEC vs IMPLEMENTATION', 'REACHABLE STATES', 'QUESTIONS FOR THE DEV', 'REGRESSION SCOPE'];
    const positions = order.map((h) => terminal.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });
});
