import ts from 'typescript';
import { showFile } from './lib/git';
import { parse, walk, lineOf, calleeName, enclosingFunctionName, enclosingRoute } from './lib/ts-ast';
import { parseArgs, readJson, writeJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { loadOpenApi, diffContract, changedSchemas, operationConstraints, constraintsOf, parseRaw, locateConstraint } from './lib/openapi';
import { CandidatesSchema, DiffSchema, type Candidate, type CandidatesFile, type ChangedFile, type Diff, type ContractChange } from './schema';

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const NORMALISERS = new Set(['toUpperCase', 'toLowerCase', 'trim', 'round', 'floor', 'ceil', 'min', 'max']);
const ACCUMULATORS = new Set(['push', 'add', 'set']);
const SIMPLE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type Draft = Omit<Candidate, 'id'>;

function rangesOf(f: ChangedFile, totalLines: number): Array<[number, number]> {
  if (f.status === 'A') return [[1, totalLines]];
  return f.hunks.filter((h) => h.newLines > 0).map((h) => [h.newStart, h.newStart + h.newLines - 1]);
}

function contextAround(lines: string[], line: number): string {
  return lines.slice(Math.max(0, line - 3), line + 2).join('\n');
}

/**
 * Identifier tokens found strictly within `[start, end)` of the source — never the whole
 * subtree of `node`, which for an `if`/`case` extends past the excerpt into the consequent
 * block (spec §2.2: identifiers are scoped to the excerpt's own source span).
 */
function identifiersInSpan(sf: ts.SourceFile, node: ts.Node, start: number, end: number): string[] {
  const out = new Set<string>();
  walk(node, (n) => {
    if (ts.isIdentifier(n) && n.getStart(sf) >= start && n.getEnd() <= end) out.add(n.text);
  });
  return [...out];
}

function hasAncestor(node: ts.Node, pred: (n: ts.Node) => boolean): boolean {
  for (let n = node.parent; n; n = n.parent) if (pred(n)) return true;
  return false;
}

function insideConditionPosition(node: ts.Node): boolean {
  for (let n = node; n.parent; n = n.parent) {
    const p = n.parent;
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) && p.expression === n) return true;
    if (ts.isConditionalExpression(p) && p.condition === n) return true;
    if (ts.isForStatement(p) && p.condition === n) return true;
  }
  return false;
}

/** Whitespace-normalized copy of a construct's own source text. */
const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

const COMPARISON_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

/** True when `node` is a non-outermost link of a same-operator `||`/`??` chain. */
function isChainContinuation(node: ts.BinaryExpression): boolean {
  const p = node.parent;
  return ts.isBinaryExpression(p) && p.operatorToken.kind === node.operatorToken.kind;
}

/**
 * End offset (exclusive) of the real `)` or `:` that closes an `if`/`case`
 * header, found by scanning forward in the source from the end of the
 * condition/expression. The gap between the two is only whitespace (the
 * expression itself is a balanced subtree, so the next occurrence of `ch`
 * in the source is genuinely the construct's own terminator) — this keeps
 * the excerpt a literal slice of the file even when the terminator sits on
 * its own indented line, instead of gluing on a synthetic character whose
 * absent whitespace would make the excerpt not actually appear in the file.
 */
function realTerminatorEnd(text: string, from: number, ch: string): number {
  const idx = text.indexOf(ch, from);
  return idx === -1 ? from : idx + 1;
}

export function collectFromSource(file: string, text: string, ranges: Array<[number, number]>): Draft[] {
  const sf = parse(file, text);
  const lines = text.split('\n');
  const inRange = (line: number) => ranges.some(([a, b]) => line >= a && line <= b);
  const drafts: Draft[] = [];

  const push = (kind: Draft['kind'], node: ts.Node, excerpt: string, extra: Partial<Draft> = {}, span?: [number, number]) => {
    const [start, end] = span ?? [node.getStart(sf), node.getEnd()];
    // The cited line must be where the EXCERPT itself starts, not where `node` does — for a
    // `do...while` the excerpt anchors on the trailing `while (...)`, textually far from the
    // `do` keyword `node.getStart()` reports (a mismatch here is exactly the citation-honesty
    // defect this milestone is about, so it must never happen even for a construct with an
    // unusual span).
    const line = sf.getLineAndCharacterOfPosition(start).line + 1;
    drafts.push({
      kind,
      file,
      line,
      excerpt,
      context: contextAround(lines, line),
      enclosingFunction: enclosingFunctionName(node),
      identifiers: identifiersInSpan(sf, node, start, end),
      source: 'code',
      route: enclosingRoute(node),
      ...extra,
    });
  };

  walk(sf, (node) => {
    if (!inRange(lineOf(sf, node))) return;

    if (ts.isIfStatement(node)) {
      const start = node.getStart(sf);
      const end = realTerminatorEnd(text, node.expression.getEnd(), ')');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isConditionalExpression(node)) {
      push('condition', node, oneLine(node.getText()));
    } else if (ts.isCaseClause(node)) {
      const start = node.getStart(sf);
      const end = realTerminatorEnd(text, node.expression.getEnd(), ':');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isDefaultClause(node)) {
      push('condition', node, 'default:');
    } else if (ts.isForStatement(node)) {
      // Loop header only (through the closing paren) — a zero-iteration pass is a testable
      // state in its own right, and the identifier scope must not leak into the loop body.
      const start = node.getStart(sf);
      const anchorEnd = (node.incrementor ?? node.condition ?? node.initializer)?.getEnd() ?? start;
      const end = realTerminatorEnd(text, anchorEnd, ')');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const start = node.getStart(sf);
      const end = realTerminatorEnd(text, node.expression.getEnd(), ')');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isWhileStatement(node)) {
      const start = node.getStart(sf);
      const end = realTerminatorEnd(text, node.expression.getEnd(), ')');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isDoStatement(node)) {
      // Anchor on the trailing `while (cond)`, not the whole `do { ... }` body.
      const whileStart = text.lastIndexOf('while', node.expression.getStart(sf));
      const start = whileStart >= 0 ? whileStart : node.expression.getStart(sf);
      const end = realTerminatorEnd(text, node.expression.getEnd(), ')');
      push('condition', node, oneLine(text.slice(start, end)), {}, [start, end]);
    } else if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && ts.isExpressionStatement(node.parent)) {
        push('condition', node, oneLine(node.getText()));
      } else if (
        (op === ts.SyntaxKind.QuestionQuestionToken && !isChainContinuation(node)) ||
        (op === ts.SyntaxKind.BarBarToken && !insideConditionPosition(node) && !isChainContinuation(node))
      ) {
        push('default', node, oneLine(node.getText()));
      } else if (COMPARISON_OPS.has(op) && !insideConditionPosition(node)) {
        push('condition', node, oneLine(node.getText()));
      }
    } else if (ts.isThrowStatement(node)) {
      const status = firstNumericStatus(node);
      push('throw', node, oneLine(node.getText()), status === undefined ? {} : { status });
    } else if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const status = node.arguments.find((a): a is ts.NumericLiteral => ts.isNumericLiteral(a) && Number(a.text) >= 400 && Number(a.text) < 600);
      if (status && !hasAncestor(node, ts.isThrowStatement)) {
        push('throw', node, oneLine(node.getText()), { status: Number(status.text) });
      } else if (callee?.method === 'next' && node.arguments.length === 1 && !hasAncestor(node, ts.isThrowStatement)) {
        push('throw', node, oneLine(node.getText()));
      } else if (callee?.object === 'z' && callee.method === 'enum') {
        push('enum', node, oneLine(node.getText()));
      } else if (callee && NORMALISERS.has(callee.method) && callee.object !== undefined && callee.object !== 'Math') {
        push('default', node, oneLine(node.getText()));
      } else if (callee && ACCUMULATORS.has(callee.method) && callee.object !== undefined && SIMPLE_IDENTIFIER.test(callee.object)) {
        // A mutating call on an accumulated local binding (`list.push(...)`) — the honest,
        // precise origin of "state built up across iterations", distinct from the loop
        // header itself and from a normaliser/enum call already handled above.
        push('default', node, oneLine(node.getText()));
      }
    } else if (ts.isEnumMember(node)) {
      push('enum', node, oneLine(node.getText()));
    } else if (ts.isUnionTypeNode(node) && node.types.length > 1 && node.types.every((t) => ts.isLiteralTypeNode(t))) {
      push('enum', node, oneLine(node.getText()));
    } else if (ts.isParameter(node) && node.initializer) {
      push('default', node, oneLine(node.getText()));
    }
  });

  return drafts;
}

function firstNumericStatus(node: ts.Node): number | undefined {
  let found: number | undefined;
  walk(node, (n) => {
    if (found === undefined && ts.isNumericLiteral(n)) {
      const v = Number(n.text);
      if (v >= 400 && v < 600) found = v;
    }
  });
  return found;
}

export function extractCodeCandidates(repo: string, diff: Diff): { drafts: Draft[]; unparsed: string[] } {
  const drafts: Draft[] = [];
  const unparsed: string[] = [];
  for (const f of diff.files) {
    if (f.status === 'D' || !CODE_FILE.test(f.file)) continue;
    const text = showFile(repo, diff.branch, f.file);
    if (text === null) continue;
    try {
      // A single pathological file (e.g. a huge `||` chain or deeply nested `if`s) can blow
      // the stack inside `walk`'s recursion; catching per-file here means the rest of the
      // branch still gets extracted instead of the whole run silently producing nothing (I4).
      drafts.push(...collectFromSource(f.file, text, rangesOf(f, text.split('\n').length)));
    } catch {
      unparsed.push(f.file);
    }
  }
  return { drafts, unparsed };
}

export function assignIds(drafts: Draft[]): Candidate[] {
  const sorted = [...drafts].sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return sorted.map((d, i) => ({ id: `c-${i + 1}`, ...d }));
}

export async function extractContractCandidates(repo: string, diff: Diff): Promise<{ drafts: Draft[]; changes: ContractChange[] }> {
  const drafts: Draft[] = [];
  const changes: ContractChange[] = [];
  for (const file of diff.contractFiles) {
    const branchText = showFile(repo, diff.branch, file);
    if (branchText === null) continue;
    const baseText = showFile(repo, diff.mergeBase, file);
    const branchDoc = await loadOpenApi(branchText);
    const baseDoc = baseText === null ? null : await loadOpenApi(baseText);
    const lines = branchText.split('\n');
    // Parsed a second time, un-dereferenced, so paths through the raw CST stay intact — the
    // dereferenced `branchDoc` above is used only to know WHAT constraints exist; WHERE they
    // are cited comes exclusively from this raw parse (C1+C2: locate structurally, never by
    // text search).
    const raw = parseRaw(branchText);

    const fileChanges = diffContract(baseDoc, branchDoc);
    for (const change of fileChanges) {
      if (change.change === 'removed') { changes.push(change); continue; }
      const op = branchDoc.paths?.[change.path]?.[change.method.toLowerCase()];
      const constraints = op ? operationConstraints(op, change.path, change.method.toLowerCase()) : [];
      changes.push(constraints.length ? { ...change, constraint: { field: constraints[0].field, rule: constraints[0].rule } } : change);
      for (const c of constraints) {
        const loc = locateConstraint(raw, c);
        if (!loc) continue; // cannot resolve an honest citation — drop rather than fabricate one
        drafts.push({
          kind: 'constraint', file, line: loc.line, excerpt: loc.excerpt, context: lines.slice(Math.max(0, loc.line - 3), loc.line + 2).join('\n'),
          identifiers: [], source: 'contract', route: { method: change.method, path: change.path }, field: c.field, rule: c.rule,
        });
      }
    }

    for (const name of changedSchemas(baseDoc, branchDoc)) {
      for (const c of constraintsOf(branchDoc.components?.schemas?.[name], name, { kind: 'schema', name })) {
        const loc = locateConstraint(raw, c);
        if (!loc) continue;
        drafts.push({
          kind: 'constraint', file, line: loc.line, excerpt: loc.excerpt, context: lines.slice(Math.max(0, loc.line - 3), loc.line + 2).join('\n'),
          identifiers: [], source: 'contract', field: c.field, rule: c.rule,
        });
      }
    }
  }
  return { drafts, changes };
}

export async function extractCandidates(repo: string, diff: Diff): Promise<CandidatesFile> {
  const code = extractCodeCandidates(repo, diff);
  const contract = await extractContractCandidates(repo, diff);
  return CandidatesSchema.parse({
    branch: diff.branch,
    candidates: assignIds([...code.drafts, ...contract.drafts]),
    contractChanges: contract.changes,
    unparsed: code.unparsed,
  });
}

const USAGE = 'usage: candidates.ts --repo <dir> --diff <diff.json> --out <file>';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.repo || !args.diff || !args.out) fail(USAGE);
  (async () => {
    try {
      const diff = DiffSchema.parse(readJson(args.diff));
      const result = await extractCandidates(args.repo, diff);
      writeJson(args.out, result);
    } catch (err) {
      fail(formatError(err));
    }
  })();
}
