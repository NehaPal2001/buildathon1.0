import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE } from './fixture';
import { computeDiff } from '../diff';
import { extractCandidates } from '../candidates';
import { validateAnalysis } from '../validate';
import { renderBrief, briefFileName } from '../render';
import { sampleAnalysis } from './sample-analysis';
import { verifyM2 } from '../verify';
import { writeJson } from '../lib/io';

let dir: string;
beforeAll(async () => {
  const candidates = await extractCandidates(FIXTURE, computeDiff(FIXTURE, 'PROJ-4821'));
  const r = validateAnalysis(sampleAnalysis(candidates), candidates, null);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-verify-'));
  writeJson(path.join(dir, 'raw/candidates.json'), candidates);
  writeJson(path.join(dir, 'analysis.json'), r.analysis);
  fs.writeFileSync(path.join(dir, briefFileName(r.analysis)), renderBrief(r.analysis).markdown);
});

describe('verifyM2', () => {
  it('passes the mechanical checks on a good analysis, and reports the missing plants', () => {
    const results = verifyM2(dir);
    const byName = Object.fromEntries(results.map((r) => [r.check, r]));
    expect(byName['analysis validates'].ok).toBe(true);
    expect(byName['every origin resolves'].ok).toBe(true);
    expect(byName['brief has no code identifiers'].ok).toBe(true);
    expect(byName['plant 2: unvalidated pattern'].ok).toBe(true);
    expect(byName['plant 3: documented 422 is a generic failure'].ok).toBe(true);
    expect(byName['plant 4: enum member with no path'].ok).toBe(true);
    // the sample deliberately omits the stacking finding
    expect(byName['plant 1: stacking permitted'].ok).toBe(false);
  });

  it('reports the unparsed sections as present, typed, and mirroring candidates.json', () => {
    const results = verifyM2(dir);
    const byName = Object.fromEntries(results.map((r) => [r.check, r]));
    expect(byName['unparsed sections present and typed (file/ui/suite)'].ok).toBe(true);
  });

  it('fails cleanly with a helpful detail when the recon dir has no analysis.json', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-verify-empty-'));
    const results = verifyM2(empty);
    expect(results).toHaveLength(1);
    expect(results[0].check).toBe('analysis validates');
    expect(results[0].ok).toBe(false);
  });
});
