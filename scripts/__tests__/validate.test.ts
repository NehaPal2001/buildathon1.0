import { describe, it, expect, beforeAll } from 'vitest';
import { FIXTURE } from './fixture';
import { computeDiff } from '../diff';
import { extractCandidates } from '../candidates';
import { validateAnalysis } from '../validate';
import { sampleAnalysis } from './sample-analysis';
import type { CandidatesFile } from '../schema';

let candidates: CandidatesFile;
beforeAll(async () => {
  candidates = await extractCandidates(FIXTURE, computeDiff(FIXTURE, 'PROJ-4821'));
});

describe('validateAnalysis', () => {
  it('accepts a good analysis and normalises origins from candidates', () => {
    const input = sampleAnalysis(candidates);
    input.states[0].origins[0].line = 999; // drifted citation
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.analysis.states[0].origins[0].line).not.toBe(999);
  });

  it('rejects an unknown candidate id', () => {
    const input = sampleAnalysis(candidates);
    input.states[0].origins[0].candidateId = 'c-9999';
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ where: 'states[0].origins[0]' });
  });

  it('rejects code identifiers in prose and names the token', () => {
    const input = sampleAnalysis(candidates);
    input.states[0].description = 'applyCoupon uppercases rawCode before lookup';
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.message).join(' ')).toMatch(/applyCoupon/);
  });

  it('rejects inClaim without a claimFragment', () => {
    const input = sampleAnalysis(candidates);
    input.states[0].inClaim = true;
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
  });

  it('applies exclusions and counts suppressed', () => {
    const input = sampleAnalysis(candidates);
    const md = '## Exclusions\n- ignore states from api/**\n- nonsense line\n';
    const r = validateAnalysis(input, candidates, md);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.analysis.suppressed).toBe(0); // no state has all origins under api/
      expect(r.analysis.exclusions.unrecognised).toEqual(['nonsense line']);
      expect(r.analysis.exclusions.recognised).toEqual(['ignore states from api/**']);
    }
    const md2 = '## Exclusions\n- ignore states from src/services/**\n';
    const r2 = validateAnalysis(sampleAnalysis(candidates), candidates, md2);
    if (r2.ok) expect(r2.analysis.suppressed).toBe(3);
  });

  // --- unparsed carry-through (M2 ruling: mirrors candidates.json/ui.json/suite.json's own
  // `unparsed` field mechanically — no LLM involvement, no judgment call) ---

  it('defaults unparsed to [] for every list when the raw files have none (the current fixture) and no ui/suite raw data is passed', () => {
    expect(candidates.unparsed).toEqual([]); // sanity: the fixture itself has no parse failures
    const r = validateAnalysis(sampleAnalysis(candidates), candidates, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.analysis.unparsed).toEqual({ file: [], ui: [], suite: [] });
  });

  it('carries a non-empty unparsed list through from candidates.json, and from raw ui/suite data when given', () => {
    const withUnparsed: CandidatesFile = { ...candidates, unparsed: ['src/weird/unparseable.ts'] };
    const r = validateAnalysis(sampleAnalysis(candidates), withUnparsed, null, {
      ui: ['e2e/broken.spec.ts'],
      suite: ['e2e/pages/Broken.ts'],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.analysis.unparsed).toEqual({
        file: ['src/weird/unparseable.ts'],
        ui: ['e2e/broken.spec.ts'],
        suite: ['e2e/pages/Broken.ts'],
      });
    }
  });

  it('ignores any unparsed the input analysis itself supplied — it is recomputed mechanically, not trusted from the LLM', () => {
    const input = sampleAnalysis(candidates);
    input.unparsed = { file: ['made-up.ts'], ui: ['made-up.spec.ts'], suite: ['made-up-page.ts'] };
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.analysis.unparsed).toEqual({ file: [], ui: [], suite: [] });
  });

  // --- fix pass 1 (review findings) ---

  it('rejects code identifiers in reachability.evidence, the same as it does for description (Important #1)', () => {
    const input = sampleAnalysis(candidates);
    // The reviewer's own repro case: a code-shaped identifier hidden specifically in `evidence`,
    // the one reachability field validate.ts was not checking at all.
    input.states[0].reachability.evidence = 'confirmed via applyCoupon() reading rawCode directly';
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.where === 'states[0].reachability.evidence')).toBe(true);
      expect(r.errors.map((e) => e.message).join(' ')).toMatch(/applyCoupon/);
    }
  });

  it('still accepts the fixture\'s real tester-language evidence strings unchanged', () => {
    // Guards against over-tightening: every state in sampleAnalysis carries a real evidence
    // string (ui and unreachable kinds); none of them should trip the new check.
    const r = validateAnalysis(sampleAnalysis(candidates), candidates, null);
    expect(r.ok).toBe(true);
  });

  it('rejects a duplicate state id and names its index (Minor)', () => {
    const input = sampleAnalysis(candidates);
    input.states.push({ ...input.states[0], origins: [{ ...input.states[0].origins[0] }] });
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({ where: 'states[3]', message: expect.stringContaining('lowercase-code') }),
      );
    }
  });

  it('sets contractChanges from candidates.json, ignoring whatever the input analysis supplied (M1)', () => {
    // contractChanges is validator-owned: an LLM copying it verbatim is trusting transcription
    // instead of code, so validate.ts recomputes it from candidates.json every time.
    const input = sampleAnalysis(candidates);
    input.contractChanges = [{ path: '/made/up', method: 'GET', change: 'removed' }];
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.analysis.contractChanges).toEqual(candidates.contractChanges);
  });

  it('omits contractChanges when candidates.json has none', () => {
    const input = sampleAnalysis(candidates);
    const emptyCandidates = { ...candidates, contractChanges: [] };
    const r = validateAnalysis(input, emptyCandidates, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.analysis.contractChanges).toBeUndefined();
  });

  it('rejects code identifiers in scope entry facts, not just reason (Minor)', () => {
    const input = sampleAnalysis(candidates);
    input.scope = {
      totalTests: 1,
      inScope: [{ spec: 'e2e/specs/coupon.spec.ts', reason: 'covers coupon application', facts: ['calls applyCoupon() directly'] }],
      outOfScope: [],
      newTests: 0,
    };
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.message).join(' ')).toMatch(/applyCoupon/);
  });

  it('rejects an exclusionNote that does not match a recognised "ignore states whose origin is …" rule (I3)', () => {
    // Guards the rule "unrecognised exclusion lines are reported, never applied": a state
    // carrying an exclusionNote that names no rule conventions.md actually declares must not be
    // silently suppressed by applyExclusions — it must fail validation instead.
    const input = sampleAnalysis(candidates);
    input.states[0].exclusionNote = 'a rule that conventions.md never declared';
    const md = '## Exclusions\n- ignore states whose origin is a logging or telemetry branch\n';
    const r = validateAnalysis(input, candidates, md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual(
        expect.objectContaining({ where: 'states[0].exclusionNote' }),
      );
    }
  });

  it('accepts and applies an exclusionNote that matches a recognised rule', () => {
    const input = sampleAnalysis(candidates);
    input.states[0].exclusionNote = 'a logging or telemetry branch';
    const md = '## Exclusions\n- ignore states whose origin is a logging or telemetry branch\n';
    const r = validateAnalysis(input, candidates, md);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.analysis.states.find((s) => s.id === 'lowercase-code')).toBeUndefined();
      expect(r.analysis.suppressed).toBe(1);
    }
  });

  it('accepts a scope entry whose reason and facts are both clean tester language', () => {
    const input = sampleAnalysis(candidates);
    input.scope = {
      totalTests: 1,
      inScope: [{ spec: 'e2e/specs/coupon.spec.ts', reason: 'covers coupon application', facts: ['the spec applies a coupon at checkout'] }],
      outOfScope: [],
      newTests: 0,
    };
    const r = validateAnalysis(input, candidates, null);
    expect(r.ok).toBe(true);
  });
});
