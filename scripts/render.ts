import fs from 'node:fs';
import path from 'node:path';
import { Doc } from './lib/brief';
import { parseArgs, readJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { AnalysisSchema, type Analysis, type Origin, type State } from './schema';

const cite = (o: Origin) => `${o.file}:${o.line}`;
const cites = (os: Origin[]) => os.map(cite).join(', ');

function reach(s: State): string {
  switch (s.reachability.kind) {
    case 'ui': return s.reachability.steps.join(' → ');
    case 'api': return `API setup — ${s.reachability.setup}`;
    case 'data': return `data setup — ${s.reachability.setup}`;
    case 'unreachable': return `⚠ no path — ${s.reachability.why}`;
  }
}

/**
 * `Analysis.unparsed` mirrors the `unparsed` field M1's extractors carry on candidates.json
 * ("file"), ui.json and suite.json: files that could not be parsed/walked, so no findings were
 * silently dropped from them — they were simply never read. validate.ts copies the three lists
 * through mechanically (schema.ts); this is the one place that honesty guarantee reaches a
 * tester actually reading the brief, so it must survive to here rather than being dropped
 * silently at the last step. Returns null when there is nothing to report (all three empty).
 */
function unparsedNote(u: Analysis['unparsed']): string | null {
  const categories: Array<[number, string]> = [
    [u.file.length, 'source'],
    [u.ui.length, 'UI'],
    [u.suite.length, 'test suite'],
  ];
  const nonEmpty = categories.filter(([n]) => n > 0);
  if (!nonEmpty.length) return null;
  const total = nonEmpty.reduce((sum, [n]) => sum + n, 0);
  const detail = nonEmpty.map(([n, label]) => `${n} ${label} file${n === 1 ? '' : 's'}`).join(', ');
  const paths = [...u.file, ...u.ui, ...u.suite].join(', ');
  return `⚠ ${total} file${total === 1 ? '' : 's'} could not be read and ${total === 1 ? 'is' : 'are'} not reflected below: ${detail}: ${paths}`;
}

export function briefFileName(a: Analysis): string {
  const slug = a.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${a.generatedAt.slice(0, 10)}-${slug}.md`;
}

export function renderBrief(a: Analysis): { terminal: string; markdown: string } {
  const d = new Doc();
  const claimLabel = a.claim.source === 'ticket' ? 'ticket' : a.claim.source === 'commits' ? 'commit messages' : 'none — branch only';
  const claimWord = a.claim.source === 'commits' ? 'implied by the commits' : 'in the claim';
  d.title(
    `COVER — ${a.branch}`,
    `${a.base} → ${a.branch} · claim source: ${claimLabel}${a.contractChanges?.length ? ' · contract changed' : ''}`,
    `${a.candidatesTotal} candidates read → ${a.states.length} states${a.suppressed ? ` (${a.suppressed} suppressed by Exclusions)` : ''}`,
  );
  const note = unparsedNote(a.unparsed);
  if (note) d.line(note, 0);

  d.heading('WHAT ACTUALLY CHANGED');
  if (!a.behaviourChanges.length) d.line('· no user-visible behaviour change found in the diff');
  for (const b of a.behaviourChanges) d.line(`· ${b.statement}  [${cites(b.origins)}]`);

  if (a.mismatches.length) {
    d.heading('⚠ SPEC vs IMPLEMENTATION');
    for (const m of a.mismatches) {
      d.line(`${m.severity === 'blocker' ? 'BLOCKER ' : 'QUESTION'} ${m.claimSays}`);
      d.line(`         ${m.codeSays}  [${cites(m.origins)}]`);
      d.line(`         → ${m.severity === 'blocker' ? 'Confirm intent before testing. Either a bug, or a stale claim.' : 'Ask before writing a test for it.'}`);
      d.blank();
    }
  }

  const inClaim = a.states.filter((s) => s.inClaim).length;
  const covered = a.states.filter((s) => s.coveredBy.length).length;
  d.heading(`REACHABLE STATES — ${a.states.length} total · ${inClaim} ${claimWord} · ${covered} covered by suite`);
  d.table(
    ['#', 'STATE', 'HOW TO REACH', 'CONF', 'CLAIM', 'COVERED', 'ORIGIN'],
    a.states.map((s, i) => [String(i + 1), s.description, reach(s), s.confidence, s.inClaim ? 'yes' : 'no', s.coveredBy.length ? `yes (${s.coveredBy.length})` : 'no', cites(s.origins)]),
  );
  const coveredDetails = a.states.filter((s) => s.coveredBy.length);
  if (coveredDetails.length) {
    d.blank();
    for (const s of coveredDetails) d.line(`covered: ${s.id} ← ${s.coveredBy.join(', ')}`);
  }

  const questions = [
    ...a.mismatches.filter((m) => m.severity === 'question').map((m) => `${m.claimSays} ${m.codeSays}  [${cites(m.origins)}]`),
    ...a.states.filter((s) => s.reachability.kind === 'unreachable').map((s) => `${s.description} ${s.reachability.kind === 'unreachable' ? s.reachability.why : ''} In scope, or dead code?  [${cites(s.origins)}]`),
    ...a.states.filter((s) => s.confidence === 'low' && s.reachability.kind !== 'unreachable').map((s) => `Low confidence: ${s.description}  [${cites(s.origins)}]`),
  ];
  d.heading('QUESTIONS FOR THE DEV');
  if (!questions.length) d.line('· none');
  questions.forEach((q, i) => d.line(`${i + 1}. ${q}`));

  if (a.suppressed || a.exclusions.unrecognised.length) {
    d.heading('EXCLUSIONS');
    if (a.suppressed) d.line(`· ${a.suppressed} states suppressed by .recon/conventions.md (${a.exclusions.recognised.join('; ')})`);
    for (const u of a.exclusions.unrecognised) d.line(`· unrecognised exclusion: ${u}`);
  }

  if (!a.scope) {
    d.heading('REGRESSION SCOPE — not computed');
    d.line('· no Playwright suite was found (checked e2e/, tests/, playwright/, test/ — pass --suite <dir> to point at one)');
  } else {
    const s = a.scope;
    d.heading(`REGRESSION SCOPE — ${s.totalTests} tests in ${s.inScope.length + s.outOfScope.length} spec files`);
    d.line(`${s.inScope.length} in scope · ${s.outOfScope.length} out · + ${s.newTests} new`);
    d.blank();
    d.table(
      ['SPEC', 'VERDICT', 'WHY'],
      [...s.inScope.map((e) => [e.spec, 'in', e.reason]), ...s.outOfScope.map((e) => [e.spec, 'out', e.reason])],
    );
  }

  return { terminal: d.terminal(), markdown: d.markdown() };
}

const USAGE = 'usage: render.ts --analysis <file> --out-dir <dir>';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.analysis || !args['out-dir']) fail(USAGE);
  try {
    const a = AnalysisSchema.parse(readJson(args.analysis));
    const { terminal, markdown } = renderBrief(a);
    const file = path.join(args['out-dir'], briefFileName(a));
    fs.mkdirSync(args['out-dir'], { recursive: true });
    fs.writeFileSync(file, markdown);
    process.stdout.write(terminal + `\n  → written to ${file}\n`);
  } catch (err) {
    fail(formatError(err));
  }
}
