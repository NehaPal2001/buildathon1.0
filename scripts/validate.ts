import fs from 'node:fs';
import { parseArgs, readJson, writeJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { codeLikeTokens } from './lib/prose';
import { parseExclusions, applyExclusions } from './lib/exclusions';
import { AnalysisSchema, CandidatesSchema, type Analysis, type CandidatesFile, type Candidate, type Origin } from './schema';

export interface ValidationError { where: string; message: string }
export type ValidationResult = { ok: true; analysis: Analysis } | { ok: false; errors: ValidationError[] };

/**
 * The `file` list comes from `candidates.unparsed` directly (already a parameter); `ui` and
 * `suite` mirror ui.json's and suite.json's own `unparsed` fields, which validate.ts does not
 * otherwise read. Both are optional: a caller that does not have that raw file for this run
 * (or an older run that predates it) simply gets `[]` for it rather than an error — see
 * `readUnparsed` below for the CLI's lenient version of the same rule.
 */
export interface RawUnparsed {
  ui?: string[];
  suite?: string[];
}

export function bannedIdentifiers(candidates: CandidatesFile): Set<string> {
  const set = new Set<string>();
  for (const c of candidates.candidates) {
    if (c.enclosingFunction) set.add(c.enclosingFunction);
    for (const id of c.identifiers) set.add(id);
  }
  return set;
}

function resolveOrigins(origins: Origin[], where: string, byId: Map<string, Candidate>, errors: ValidationError[]): Origin[] {
  return origins.map((o, i) => {
    const c = byId.get(o.candidateId);
    if (!c) {
      errors.push({ where: `${where}[${i}]`, message: `origin candidateId "${o.candidateId}" is not in candidates.json — cite a real candidate or drop the finding` });
      return o;
    }
    return { candidateId: c.id, file: c.file, line: c.line, excerpt: c.excerpt, source: c.source };
  });
}

function checkProse(text: string, where: string, banned: Set<string>, errors: ValidationError[]): void {
  const bad = codeLikeTokens(text, banned);
  if (bad.length) errors.push({ where, message: `code identifiers in prose: ${bad.join(', ')} — rewrite in tester language (see tester-language skill)` });
}

export function validateAnalysis(input: unknown, candidates: CandidatesFile, conventionsMd: string | null, raw: RawUnparsed = {}): ValidationResult {
  const parsed = AnalysisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => ({ where: i.path.join('.') || '(root)', message: i.message })) };
  }
  const a = parsed.data;
  const errors: ValidationError[] = [];
  const byId = new Map(candidates.candidates.map((c) => [c.id, c]));
  const banned = bannedIdentifiers(candidates);
  // Parsed early (not just before applyExclusions below) so the states loop can check
  // exclusionNote against it before the errors.length early-return.
  const ex = parseExclusions(conventionsMd);

  a.behaviourChanges = a.behaviourChanges.map((b, i) => {
    checkProse(b.statement, `behaviourChanges[${i}].statement`, banned, errors);
    return { ...b, origins: resolveOrigins(b.origins, `behaviourChanges[${i}].origins`, byId, errors) };
  });
  a.mismatches = a.mismatches.map((m, i) => {
    checkProse(m.claimSays, `mismatches[${i}].claimSays`, banned, errors);
    checkProse(m.codeSays, `mismatches[${i}].codeSays`, banned, errors);
    return { ...m, origins: resolveOrigins(m.origins, `mismatches[${i}].origins`, byId, errors) };
  });
  a.states = a.states.map((s, i) => {
    checkProse(s.description, `states[${i}].description`, banned, errors);
    if (s.reachability.kind === 'ui') s.reachability.steps.forEach((step, j) => checkProse(step, `states[${i}].reachability.steps[${j}]`, banned, errors));
    if (s.reachability.kind === 'api' || s.reachability.kind === 'data') checkProse(s.reachability.setup, `states[${i}].reachability.setup`, banned, errors);
    if (s.reachability.kind === 'unreachable') checkProse(s.reachability.why, `states[${i}].reachability.why`, banned, errors);
    // `evidence` is common to all four ReachabilitySchema variants (unlike steps/setup/why,
    // which are kind-specific), so it needs no branch — but it is exactly as tester-facing as
    // the fields above and was previously never checked at all.
    checkProse(s.reachability.evidence, `states[${i}].reachability.evidence`, banned, errors);
    // I3: an exclusionNote is only ever applied by applyExclusions below on its mere presence
    // (it can't tell a real rule from noise) — so validation is what has to enforce "unrecognised
    // exclusion lines are reported, never applied". Only form 2 ("ignore states whose origin is
    // …") is expressed through exclusionNote; forms 1/3 are matched by code (glob / always-in-
    // scope) and never appear here.
    if (s.exclusionNote !== undefined && !ex.ignoreOrigins.includes(s.exclusionNote)) {
      errors.push({ where: `states[${i}].exclusionNote`, message: `exclusionNote "${s.exclusionNote}" does not match a recognised "ignore states whose origin is …" rule in conventions.md` });
    }
    return { ...s, origins: resolveOrigins(s.origins, `states[${i}].origins`, byId, errors) };
  });
  if (a.scope) {
    [...a.scope.inScope, ...a.scope.outOfScope].forEach((e, i) => {
      checkProse(e.reason, `scope[${i}].reason`, banned, errors);
      e.facts.forEach((f, j) => checkProse(f, `scope[${i}].facts[${j}]`, banned, errors));
    });
  }
  const ids = a.states.map((s) => s.id);
  a.states.forEach((s, i) => {
    if (ids.indexOf(s.id) !== i) errors.push({ where: `states[${i}]`, message: `duplicate state id "${s.id}"` });
  });

  if (errors.length) return { ok: false, errors };

  const { kept, suppressed } = applyExclusions(a.states, ex);
  a.states = kept;
  a.suppressed = suppressed;
  a.exclusions = {
    recognised: [
      ...ex.ignoreGlobs.map((g) => `ignore states from ${g}`),
      ...ex.ignoreOrigins.map((o) => `ignore states whose origin is ${o}`),
      ...ex.alwaysInScope.map((p) => `treat ${p} as always in regression scope`),
    ],
    unrecognised: ex.unrecognised,
  };
  a.candidatesTotal = candidates.candidates.length;
  // M1 review: contractChanges is validator-owned, not copied by Claude — the skill said to copy
  // it verbatim, which means trusting the LLM to transcribe candidates.json.contractChanges
  // faithfully instead of code just doing it. Same mechanical-carry-forward reasoning as
  // candidatesTotal and unparsed below.
  a.contractChanges = candidates.contractChanges.length ? candidates.contractChanges : undefined;
  // Mechanical carry-forward (M2 ruling), not a judgment call: an LLM has no way to know which
  // files M1's extractors failed to read, so this is never taken from the input analysis —
  // always recomputed from the raw fact files, the same way candidatesTotal is just above.
  a.unparsed = {
    file: candidates.unparsed ?? [],
    ui: raw.ui ?? [],
    suite: raw.suite ?? [],
  };
  return { ok: true, analysis: a };
}

/** Lenient read of a raw fact file's own `unparsed` list: absent file, absent field, or a file
 *  that fails to parse as JSON all fall back to `[]` rather than failing validate.ts's own run —
 *  this carry-through must never be why validation errors out. */
function readUnparsed(file: string | undefined): string[] {
  if (!file || !fs.existsSync(file)) return [];
  try {
    const json = readJson<{ unparsed?: unknown }>(file);
    return Array.isArray(json?.unparsed) ? json.unparsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const USAGE = 'usage: validate.ts --analysis <file> --candidates <file> [--conventions <file>] [--ui <file>] [--suite <file>]';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.analysis || !args.candidates) fail(USAGE);
  try {
    const candidates = CandidatesSchema.parse(readJson(args.candidates));
    const conventions = args.conventions && fs.existsSync(args.conventions) ? fs.readFileSync(args.conventions, 'utf8') : null;
    const raw: RawUnparsed = { ui: readUnparsed(args.ui), suite: readUnparsed(args.suite) };
    const result = validateAnalysis(readJson(args.analysis), candidates, conventions, raw);
    if (!result.ok) {
      // Not a crash — a validation result, reported the way the brief specifies (JSON on stdout,
      // exit 1). Only genuine exceptions below (a missing/malformed file, something unexpected)
      // go through the catch block's one-line formatError treatment.
      process.stdout.write(JSON.stringify(result.errors, null, 2) + '\n');
      process.exit(1);
    }
    writeJson(args.analysis, result.analysis);
  } catch (err) {
    fail(formatError(err));
  }
}
