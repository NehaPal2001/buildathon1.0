import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { AnalysisSchema, type Analysis, type Origin, type State } from './schema';

/**
 * A third render target beside render.ts's terminal and markdown output, for the case the
 * markdown brief does not serve: handing a whole QA audience one page they can sort and filter
 * without reading top to bottom. It renders the SAME analysis.json and keeps the fixed section
 * order (BUILD.md §2) — nothing here re-derives a finding or adds one.
 *
 * Self-contained by construction: one file, inline CSS and JS, no network requests, no build
 * step and no dependency beyond the schema. A QA lead can mail it or drop it in a CI artifact
 * and it opens anywhere.
 */

export interface EvidenceFile {
  name: string;
  body: string;
}

/**
 * Everything written into the page goes through here. The prose in analysis.json is model-written
 * and the excerpts are verbatim source — both routinely contain <, > and & (`cartSubtotal <
 * coupon.minCart`, `'PERCENT' | 'FLAT'`), which would silently truncate the page or smuggle
 * markup if interpolated raw.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const cite = (o: Origin) => `${o.file}:${o.line}`;
const cites = (os: Origin[]) => os.map(cite).join(', ');

function reach(s: State): string {
  switch (s.reachability.kind) {
    case 'ui': return s.reachability.steps.join(' → ');
    case 'api': return `API setup — ${s.reachability.setup}`;
    case 'data': return `data setup — ${s.reachability.setup}`;
    case 'unreachable': return `no path — ${s.reachability.why}`;
  }
}

/** Test-first order: what a tester should pick up first, not the order states were found. */
const CONFIDENCE_RANK: Record<State['confidence'], number> = { high: 0, medium: 1, low: 2 };
const REACH_RANK: Record<State['reachability']['kind'], number> = { ui: 0, api: 1, data: 2, unreachable: 3 };

export function prioritise(states: State[]): State[] {
  return [...states].sort((a, b) =>
    REACH_RANK[a.reachability.kind] - REACH_RANK[b.reachability.kind] ||
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    Number(a.inClaim) - Number(b.inClaim));
}

export function htmlFileName(a: Analysis): string {
  const slug = a.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${a.generatedAt.slice(0, 10)}-${slug}.html`;
}

const STYLE = `
:root{
  --bg:#fbfbfa; --panel:#fff; --ink:#1a1a18; --muted:#6b6b66; --line:#e4e4e0;
  --blocker:#b3261e; --blocker-bg:#fdeceb; --question:#8a5a00; --question-bg:#fdf4e3;
  --ok:#1f6f43; --ok-bg:#e9f5ee; --accent:#2b4ea8; --chip:#f1f1ee;
}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --bg:#17171a; --panel:#1f1f23; --ink:#ececea; --muted:#9a9a95; --line:#32323a;
  --blocker:#ff9a92; --blocker-bg:#3a1f1d; --question:#f0c475; --question-bg:#3a2e18;
  --ok:#86d6a5; --ok-bg:#1b2f23; --accent:#9db6f0; --chip:#2a2a30;
}}
:root[data-theme="dark"]{
  --bg:#17171a; --panel:#1f1f23; --ink:#ececea; --muted:#9a9a95; --line:#32323a;
  --blocker:#ff9a92; --blocker-bg:#3a1f1d; --question:#f0c475; --question-bg:#3a2e18;
  --ok:#86d6a5; --ok-bg:#1b2f23; --accent:#9db6f0; --chip:#2a2a30;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1140px;margin:0 auto;padding:32px 20px 72px}
h1{font-size:25px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);
  margin:40px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.sub{color:var(--muted);font-size:13.5px;margin:0 0 3px}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin-top:22px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:13px 14px}
.tile .n{font-size:25px;font-weight:650;letter-spacing:-.02em}
.tile .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:3px}
.tile.bad .n{color:var(--blocker)} .tile.warn .n{color:var(--question)} .tile.good .n{color:var(--ok)}
.find{background:var(--panel);border:1px solid var(--line);border-left-width:4px;
  border-radius:8px;padding:13px 15px;margin-bottom:11px}
.find.blocker{border-left-color:var(--blocker)} .find.question{border-left-color:var(--question)}
.tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.07em;
  padding:2px 7px;border-radius:4px;vertical-align:1px}
.tag.blocker{background:var(--blocker-bg);color:var(--blocker)}
.tag.question{background:var(--question-bg);color:var(--question)}
.claim{font-weight:600;margin:7px 0 5px}
.code-says{color:var(--ink)}
.why{color:var(--muted);font-size:13px;margin-top:7px}
.origins{margin-top:8px}
.origins a,.origins span{display:inline-block;background:var(--chip);border-radius:4px;
  padding:1px 6px;margin:2px 4px 0 0;font-family:ui-monospace,Consolas,monospace;
  font-size:11.5px;color:var(--muted);text-decoration:none}
ul.changes{margin:0;padding-left:19px} ul.changes li{margin-bottom:9px}
.controls{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 13px}
.controls button{font:inherit;font-size:12.5px;padding:4px 11px;border-radius:999px;
  border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer}
.controls button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;min-width:760px;background:var(--panel)}
th,td{text-align:left;vertical-align:top;padding:9px 11px;border-bottom:1px solid var(--line);font-size:13.5px}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  position:sticky;top:0;background:var(--panel)}
tr.hide{display:none}
.pill{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:4px;white-space:nowrap}
.pill.high{background:var(--blocker-bg);color:var(--blocker)}
.pill.medium{background:var(--question-bg);color:var(--question)}
.pill.low{background:var(--chip);color:var(--muted)}
.pill.yes{background:var(--ok-bg);color:var(--ok)} .pill.no{background:var(--chip);color:var(--muted)}
.steps{color:var(--muted);font-size:12.5px}
.note{background:var(--question-bg);color:var(--question);border-radius:7px;
  padding:10px 13px;font-size:13px;margin:16px 0}
ol.q{padding-left:21px;margin:0} ol.q li{margin-bottom:11px}
pre.ev{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:13px;
  overflow-x:auto;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12px}
.toggle{float:right;font:inherit;font-size:12px;padding:4px 11px;border-radius:999px;
  border:1px solid var(--line);background:var(--panel);color:var(--muted);cursor:pointer}
@media print{.controls,.toggle{display:none}tr.hide{display:table-row}}
`;

/** Filtering and the theme switch. Inline so the page stays one self-contained file. */
const SCRIPT = `
(function(){
  var btns=document.querySelectorAll('.controls button');
  function apply(){
    var on={};
    btns.forEach(function(b){ if(b.getAttribute('aria-pressed')==='true') on[b.dataset.group]=b.dataset.value; });
    document.querySelectorAll('tbody tr').forEach(function(tr){
      var hide=false;
      for(var g in on){ if(on[g]!=='all' && tr.dataset[g]!==on[g]) hide=true; }
      tr.classList.toggle('hide',hide);
    });
    var shown=document.querySelectorAll('tbody tr:not(.hide)').length;
    var c=document.getElementById('shown'); if(c) c.textContent=shown;
  }
  btns.forEach(function(b){ b.addEventListener('click',function(){
    btns.forEach(function(o){ if(o.dataset.group===b.dataset.group) o.setAttribute('aria-pressed','false'); });
    b.setAttribute('aria-pressed','true'); apply();
  }); });
  apply();
  var t=document.getElementById('theme');
  if(t) t.addEventListener('click',function(){
    var cur=document.documentElement.getAttribute('data-theme');
    var next=cur==='dark'?'light':cur==='light'?'dark':
      (window.matchMedia('(prefers-color-scheme:dark)').matches?'light':'dark');
    document.documentElement.setAttribute('data-theme',next);
  });
})();
`;

export function renderHtml(a: Analysis, evidence: EvidenceFile[] = []): string {
  const claimLabel = a.claim.source === 'ticket' ? 'ticket' : a.claim.source === 'commits' ? 'commit messages' : 'none — branch only';
  const claimWord = a.claim.source === 'commits' ? 'implied by the commits' : 'in the claim';
  const blockers = a.mismatches.filter((m) => m.severity === 'blocker');
  const questionMismatches = a.mismatches.filter((m) => m.severity === 'question');
  const inClaim = a.states.filter((s) => s.inClaim).length;
  const covered = a.states.filter((s) => s.coveredBy.length).length;
  const testable = a.states.filter((s) => s.reachability.kind !== 'unreachable');
  const states = prioritise(a.states);

  const unparsedTotal = a.unparsed.file.length + a.unparsed.ui.length + a.unparsed.suite.length;
  const unparsedPaths = [...a.unparsed.file, ...a.unparsed.ui, ...a.unparsed.suite];

  const questions = [
    ...questionMismatches.map((m) => `${m.claimSays} ${m.codeSays}  [${cites(m.origins)}]`),
    ...a.states.filter((s) => s.reachability.kind === 'unreachable')
      .map((s) => `${s.description} ${s.reachability.kind === 'unreachable' ? s.reachability.why : ''} In scope, or dead code?  [${cites(s.origins)}]`),
    ...a.states.filter((s) => s.confidence === 'low' && s.reachability.kind !== 'unreachable')
      .map((s) => `Low confidence: ${s.description}  [${cites(s.origins)}]`),
  ];

  const h: string[] = [];
  h.push(`<title>QA brief — ${esc(a.branch)}</title>`);
  h.push(`<style>${STYLE}</style>`);
  h.push(`<div class="wrap">`);

  h.push(`<button class="toggle" id="theme" type="button">dark / light</button>`);
  h.push(`<h1>QA brief — ${esc(a.branch)}</h1>`);
  h.push(`<p class="sub">${esc(a.base)} → ${esc(a.branch)} · claim source: ${esc(claimLabel)}${a.contractChanges?.length ? ' · contract changed' : ''}</p>`);
  h.push(`<p class="sub">${a.candidatesTotal} candidates read → ${a.states.length} states${a.suppressed ? ` · ${a.suppressed} suppressed by exclusions` : ''} · generated ${esc(a.generatedAt)}</p>`);

  // Tiles: the numbers a QA lead triages on.
  h.push(`<div class="tiles">`);
  h.push(tile(blockers.length, 'blockers', blockers.length ? 'bad' : 'good'));
  h.push(tile(questions.length, 'questions for dev', questions.length ? 'warn' : 'good'));
  h.push(tile(testable.length, 'testable states'));
  h.push(tile(a.states.length - inClaim, `not ${claimWord}`, a.states.length - inClaim ? 'warn' : ''));
  h.push(tile(a.states.length - covered, 'uncovered states', a.states.length - covered ? 'warn' : 'good'));
  h.push(`</div>`);

  if (unparsedTotal) {
    h.push(`<div class="note">${unparsedTotal} file${unparsedTotal === 1 ? '' : 's'} could not be read, so nothing from ${unparsedTotal === 1 ? 'it' : 'them'} is reflected here: <span class="mono">${esc(unparsedPaths.join(', '))}</span></div>`);
  }

  h.push(`<h2>What actually changed</h2>`);
  if (!a.behaviourChanges.length) {
    h.push(`<p class="sub">No user-visible behaviour change was found in the diff.</p>`);
  } else {
    h.push(`<ul class="changes">`);
    for (const b of a.behaviourChanges) {
      h.push(`<li>${esc(b.statement)}${originChips(b.origins)}</li>`);
    }
    h.push(`</ul>`);
  }

  h.push(`<h2>Spec vs implementation</h2>`);
  if (!a.mismatches.length) {
    h.push(`<p class="sub">No disagreement found between the claim, the contract and the code.</p>`);
  } else {
    for (const m of [...blockers, ...questionMismatches]) {
      h.push(`<div class="find ${m.severity}">`);
      h.push(`<span class="tag ${m.severity}">${m.severity === 'blocker' ? 'BLOCKER' : 'QUESTION'}</span>`);
      h.push(`<div class="claim">${esc(m.claimSays)}</div>`);
      h.push(`<div class="code-says">${esc(m.codeSays)}</div>`);
      h.push(`<div class="why">→ ${m.severity === 'blocker' ? 'Confirm intent before testing. Either a bug, or a stale claim.' : 'Ask before writing a test for it.'}</div>`);
      h.push(originChips(m.origins));
      h.push(`</div>`);
    }
  }

  h.push(`<h2>Reachable states — <span id="shown">${a.states.length}</span> of ${a.states.length} shown · ${inClaim} ${esc(claimWord)} · ${covered} covered by suite</h2>`);
  h.push(`<div class="controls">`);
  h.push(group('conf', 'confidence', [['all', 'all confidence'], ['high', 'high'], ['medium', 'medium'], ['low', 'low']]));
  h.push(group('kind', 'reachability', [['all', 'all paths'], ['ui', 'UI'], ['api', 'API'], ['data', 'data'], ['unreachable', 'no path']]));
  h.push(group('claim', 'claim', [['all', 'all'], ['no', `not ${claimWord}`], ['yes', claimWord]]));
  h.push(`</div>`);
  h.push(`<div class="scroll"><table><thead><tr>`);
  for (const c of ['#', 'State', 'How to reach', 'Conf', 'Claim', 'Covered', 'Origin']) h.push(`<th>${esc(c)}</th>`);
  h.push(`</tr></thead><tbody>`);
  states.forEach((s, i) => {
    h.push(`<tr data-conf="${s.confidence}" data-kind="${s.reachability.kind}" data-claim="${s.inClaim ? 'yes' : 'no'}">`);
    h.push(`<td class="mono">${i + 1}</td>`);
    h.push(`<td>${esc(s.description)}</td>`);
    h.push(`<td class="steps">${esc(reach(s))}</td>`);
    h.push(`<td><span class="pill ${s.confidence}">${s.confidence}</span></td>`);
    h.push(`<td><span class="pill ${s.inClaim ? 'yes' : 'no'}">${s.inClaim ? 'yes' : 'no'}</span></td>`);
    h.push(`<td><span class="pill ${s.coveredBy.length ? 'yes' : 'no'}">${s.coveredBy.length ? `yes (${s.coveredBy.length})` : 'no'}</span></td>`);
    h.push(`<td>${originChips(s.origins)}</td>`);
    h.push(`</tr>`);
  });
  h.push(`</tbody></table></div>`);

  h.push(`<h2>Questions for the dev</h2>`);
  if (!questions.length) {
    h.push(`<p class="sub">None.</p>`);
  } else {
    h.push(`<ol class="q">`);
    for (const q of questions) h.push(`<li>${esc(q)}</li>`);
    h.push(`</ol>`);
  }

  if (a.suppressed || a.exclusions.unrecognised.length) {
    h.push(`<h2>Exclusions</h2><ul class="changes">`);
    if (a.suppressed) h.push(`<li>${a.suppressed} state${a.suppressed === 1 ? '' : 's'} suppressed by your exclusion rules (${esc(a.exclusions.recognised.join('; '))})</li>`);
    for (const u of a.exclusions.unrecognised) h.push(`<li>Unrecognised exclusion rule, not applied: <span class="mono">${esc(u)}</span></li>`);
    h.push(`</ul>`);
  }

  if (evidence.length) {
    h.push(`<h2>Evidence — checked against the running app</h2>`);
    for (const e of evidence) {
      h.push(`<p class="sub mono">${esc(e.name)}</p><pre class="ev">${esc(e.body)}</pre>`);
    }
  }

  // Fixed section order ends with scope (BUILD.md §2).
  if (!a.scope) {
    h.push(`<h2>Regression scope — not computed</h2>`);
    h.push(`<p class="sub">Coverage matching and regression scope are not produced by this milestone, so every state above reads &ldquo;covered: no&rdquo; regardless of what the suite actually covers. Do not read that column as a coverage result.</p>`);
  } else {
    const s = a.scope;
    h.push(`<h2>Regression scope — ${s.totalTests} tests in ${s.inScope.length + s.outOfScope.length} spec files</h2>`);
    h.push(`<p class="sub">${s.inScope.length} in scope · ${s.outOfScope.length} out · ${s.newTests} new to write</p>`);
    h.push(`<div class="scroll"><table><thead><tr><th>Spec</th><th>Verdict</th><th>Why</th></tr></thead><tbody>`);
    for (const e of s.inScope) h.push(`<tr><td class="mono">${esc(e.spec)}</td><td><span class="pill high">in</span></td><td>${esc(e.reason)}</td></tr>`);
    for (const e of s.outOfScope) h.push(`<tr><td class="mono">${esc(e.spec)}</td><td><span class="pill no">out</span></td><td>${esc(e.reason)}</td></tr>`);
    h.push(`</tbody></table></div>`);
  }

  h.push(`<footer>Every statement above cites the file and line it came from, and each citation was resolved against the extracted facts before this page was written. Generated by Recon from <span class="mono">analysis.json</span>; nothing here is re-derived.</footer>`);
  h.push(`</div><script>${SCRIPT}</script>`);
  return h.join('\n');
}

function tile(n: number, label: string, cls = ''): string {
  return `<div class="tile ${cls}"><div class="n">${n}</div><div class="k">${esc(label)}</div></div>`;
}

function group(key: string, label: string, opts: Array<[string, string]>): string {
  return opts
    .map(([v, text], i) => `<button type="button" data-group="${key}" data-value="${v}" aria-pressed="${i === 0 ? 'true' : 'false'}" title="${esc(label)}">${esc(text)}</button>`)
    .join('');
}

function originChips(os: Origin[]): string {
  return `<div class="origins">${os.map((o) => `<span>${esc(cite(o))}</span>`).join('')}</div>`;
}

/** Reads any .md/.txt sitting in an evidence directory, so observations made outside the
 *  deterministic pipeline (a probe against the running app, a suite run) travel with the brief. */
export function readEvidence(dir: string): EvidenceFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((f) => ({ name: f, body: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

const USAGE = 'usage: render-html.ts --analysis <file> --out-dir <dir> [--evidence <dir>]';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.analysis || !args['out-dir']) fail(USAGE);
  try {
    const a = AnalysisSchema.parse(readJson(args.analysis));
    const evidence = args.evidence ? readEvidence(args.evidence) : [];
    const file = path.join(args['out-dir'], htmlFileName(a));
    fs.mkdirSync(args['out-dir'], { recursive: true });
    fs.writeFileSync(file, renderHtml(a, evidence));
    process.stdout.write(`${file}\n`);
  } catch (err) {
    fail(formatError(err));
  }
}
