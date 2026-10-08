import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, fail, isMain, wantsHelp, printUsage } from './lib/io';
import { codeLikeTokens } from './lib/prose';
import { bannedIdentifiers } from './validate';
import { AnalysisSchema, CandidatesSchema, type Analysis, type CandidatesFile } from './schema';

const USAGE = 'usage: verify.ts --recon <.recon dir> [--milestone <2|3|4>]';

export interface VerifyResult { check: string; ok: boolean; detail?: string }

function load(reconDir: string): { a: Analysis; c: CandidatesFile; brief: string } {
  const c = CandidatesSchema.parse(readJson(path.join(reconDir, 'raw/candidates.json')));
  const a = AnalysisSchema.parse(readJson(path.join(reconDir, 'analysis.json')));
  const briefs = fs.readdirSync(reconDir).filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f)).sort();
  const brief = briefs.length ? fs.readFileSync(path.join(reconDir, briefs[briefs.length - 1]), 'utf8') : '';
  return { a, c, brief };
}

const hasOrigin = (a: Analysis, needle: string, from: 'states' | 'mismatches' | 'any' = 'any') => {
  const pools = from === 'any' ? [...a.states, ...a.mismatches, ...a.behaviourChanges] : a[from];
  return pools.some((x) => x.origins.some((o) => o.excerpt.includes(needle)));
};

/** True when `x` is an array whose every element is a string — the shape `Analysis.unparsed`'s
 *  three fields must have. Zod already enforces this on `a` as a whole (see `load` above), so in
 *  practice this is redundant with a successful parse; it exists as its own named check because
 *  M2's done-criteria list (spec §8) calls out `unparsed` survival explicitly, and a dedicated
 *  line here keeps that guarantee visible in the check list rather than buried inside "analysis
 *  validates" — and it keeps working as its own assertion if `unparsed` ever stops being
 *  zod-defaulted (e.g. becomes required upstream). */
function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

export function verifyM2(reconDir: string): VerifyResult[] {
  const out: VerifyResult[] = [];
  let loaded: ReturnType<typeof load>;
  try {
    loaded = load(reconDir);
    out.push({ check: 'analysis validates', ok: true });
  } catch (err) {
    return [{ check: 'analysis validates', ok: false, detail: (err as Error).message }];
  }
  const { a, c, brief } = loaded;

  // Structural check for the `unparsed: {file,ui,suite}` honesty guarantee (schema.ts, M2
  // ruling): present and correctly typed, not that any list is non-empty — a clean fixture run
  // has none, and that is the correct result, not a failure. `file` is also cross-checked
  // against candidates.json's own `unparsed` list, since validate.ts's contract is to carry it
  // through mechanically (see validate.ts's comment above its own `a.unparsed = {...}` line) —
  // still purely structural, and holds trivially (`[] === []`) on the clean fixture too.
  const u = a.unparsed;
  const unparsedTyped = Boolean(u) && isStringArray(u.file) && isStringArray(u.ui) && isStringArray(u.suite);
  const fileMirrorsCandidates = unparsedTyped && JSON.stringify([...u.file].sort()) === JSON.stringify([...c.unparsed].sort());
  out.push({
    check: 'unparsed sections present and typed (file/ui/suite)',
    ok: unparsedTyped && fileMirrorsCandidates,
    detail: !unparsedTyped ? JSON.stringify(u) : !fileMirrorsCandidates ? `analysis.unparsed.file ${JSON.stringify(u.file)} != candidates.json unparsed ${JSON.stringify(c.unparsed)}` : undefined,
  });

  const ids = new Set(c.candidates.map((x) => x.id));
  const allOrigins = [...a.states, ...a.mismatches, ...a.behaviourChanges].flatMap((x) => x.origins);
  const unresolved = allOrigins.filter((o) => !ids.has(o.candidateId));
  out.push({ check: 'every origin resolves', ok: unresolved.length === 0, detail: unresolved.map((o) => o.candidateId).join(', ') });

  const banned = bannedIdentifiers(c);
  const bad = codeLikeTokens(brief, banned); // file citations are stripped inside codeLikeTokens
  out.push({ check: 'brief has no code identifiers', ok: brief.length > 0 && bad.length === 0, detail: brief.length ? bad.join(', ') : 'no brief file found' });

  out.push({ check: 'brief ends with REGRESSION SCOPE', ok: brief.lastIndexOf('REGRESSION SCOPE') > brief.lastIndexOf('QUESTIONS FOR THE DEV') });

  // The four plants, by the candidate excerpts a correct analysis must cite.
  const stacking = a.mismatches.some((m) => /one coupon|stack|second|more than one/i.test(m.claimSays + ' ' + m.codeSays) && m.origins.some((o) => o.file.endsWith('services/coupon.ts')));
  out.push({ check: 'plant 1: stacking permitted', ok: stacking });
  out.push({ check: 'plant 2: unvalidated pattern', ok: hasOrigin(a, '^[A-Z0-9]{6,12}$', 'mismatches') });
  out.push({ check: 'plant 3: documented 422 is a generic failure', ok: hasOrigin(a, "throw new Error('cart below minimum')", 'mismatches') || (hasOrigin(a, 'response 422', 'mismatches')) });
  const bogo = a.states.find((s) => s.origins.some((o) => o.excerpt.includes('BOGO')));
  out.push({ check: 'plant 4: enum member with no path', ok: Boolean(bogo && (bogo.reachability.kind === 'unreachable' || bogo.reachability.kind === 'api')), detail: bogo ? bogo.reachability.kind : 'no state cites BOGO' });

  const uiWithoutEvidence = a.states.filter((s) => s.reachability.kind === 'ui' && !s.reachability.evidence.trim());
  out.push({ check: 'ui reachability carries evidence', ok: uiWithoutEvidence.length === 0, detail: uiWithoutEvidence.map((s) => s.id).join(', ') });
  return out;
}

export function printResults(results: VerifyResult[]): boolean {
  for (const r of results) process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.detail ? `  (${r.detail})` : ''}\n`);
  return results.every((r) => r.ok);
}

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.recon) fail(USAGE);
  const milestone = Number(args.milestone ?? 2);
  const results = milestone >= 2 ? verifyM2(args.recon) : [];
  if (!printResults(results)) process.exit(1);
}
