import ts from 'typescript';
import { listFiles, showFile, resolveBranch } from './lib/git';
import { parse, walk, lineOf, calleeName, stringArg, resolveRelative, reachFrom } from './lib/ts-ast';
import { extractElements } from './lib/html';
import { parseArgs, writeJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { UiSchema, type Route, type SurfaceElement, type Ui } from './schema';

const HTTP_VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function appFiles(repo: string, ref: string, suiteDir: string | null): Map<string, string> {
  const texts = new Map<string, string>();
  for (const f of listFiles(repo, ref)) {
    if (!SOURCE.test(f) && !f.endsWith('.html')) continue;
    if (f.includes('node_modules/') || f.endsWith('.d.ts') || /\.(spec|test)\./.test(f)) continue;
    if (suiteDir && f.startsWith(suiteDir + '/')) continue;
    if (/(^|\/)(playwright|vitest|jest)\.config\./.test(f)) continue;
    const text = showFile(repo, ref, f);
    if (text !== null) texts.set(f, text);
  }
  return texts;
}

/** `express` bindings in a file: the local name for its default export, and every local
 * name bound to its named `Router` export (covers `import { Router as R }` aliasing). */
function expressBindings(sf: ts.SourceFile): { defaultAlias?: string; routerAliases: Set<string> } {
  let defaultAlias: string | undefined;
  const routerAliases = new Set<string>();
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || n.moduleSpecifier.text !== 'express' || !n.importClause) return;
    const clause = n.importClause;
    if (clause.name) defaultAlias = clause.name.text;
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === 'Router') routerAliases.add(el.name.text);
        }
      } else if (ts.isNamespaceImport(clause.namedBindings)) {
        // `import * as express from 'express'`: for a CommonJS module the namespace
        // object itself behaves as the default export, so it covers both `express()`
        // and `express.Router()`.
        defaultAlias = clause.namedBindings.name.text;
      }
    }
  });
  return { defaultAlias, routerAliases };
}

/** Variables initialised with `Router()` (however imported/aliased) or `express.Router()` → their names. */
function routerVars(sf: ts.SourceFile, bindings: { defaultAlias?: string; routerAliases: Set<string> }): Set<string> {
  const names = new Set<string>();
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer || !ts.isCallExpression(n.initializer)) return;
    const callee = n.initializer.expression;
    const isAliasedRouterCall = ts.isIdentifier(callee) && bindings.routerAliases.has(callee.text);
    const isPropertyRouterCall =
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'Router' &&
      ts.isIdentifier(callee.expression) &&
      bindings.defaultAlias !== undefined &&
      callee.expression.text === bindings.defaultAlias;
    if (isAliasedRouterCall || isPropertyRouterCall) names.add(n.name.text);
  });
  return names;
}

/** Variables initialised by calling the `express` default export directly (`express()`) → their names,
 * regardless of what the variable itself is called (e.g. `const server = ex();`). */
function appVars(sf: ts.SourceFile, bindings: { defaultAlias?: string; routerAliases: Set<string> }): Set<string> {
  const names = new Set<string>();
  if (!bindings.defaultAlias) return names;
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer || !ts.isCallExpression(n.initializer)) return;
    const callee = n.initializer.expression;
    if (ts.isIdentifier(callee) && callee.text === bindings.defaultAlias) names.add(n.name.text);
  });
  return names;
}

/**
 * Given the base expression a `.verb(...)` call is chained onto, peel back through
 * any number of further `.verb(...)` links (`router.route('/x').get(a).post(b)`) to
 * find the `.route(path)` call underneath, returning its router variable and path.
 */
function findRouteChainBase(expr: ts.Expression): { object: string; path: string } | null {
  if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return null;
  const callee = expr.expression;
  const method = callee.name.text;
  if (method === 'route') {
    const path = stringArg(expr.arguments[0]);
    if (path && ts.isIdentifier(callee.expression)) return { object: callee.expression.text, path };
    return null;
  }
  if (HTTP_VERBS.has(method)) return findRouteChainBase(callee.expression);
  return null;
}

/**
 * The `[start, end)` range of every `${...}` substitution in a `TemplateExpression`,
 * relative to `raw` — the html string `extractUi` passes to `extractElements`, i.e.
 * the template's text with its opening backtick stripped (see `templateRaw` below).
 *
 * Placeholder boundaries are read directly from the AST rather than inferred from
 * text (brace-counting, quote-tracking, ...): that inference is unfixably ambiguous
 * without a real parser, since string/template/regex literals and comments inside
 * the JS expression are indistinguishable from ordinary characters to a text
 * scanner (confirmed: the fixture itself has a regex literal — `q.replace(/"/g,
 * ...)` — inside a placeholder). The compiler has already done this parsing for us.
 *
 * The mapping was established empirically (see the round-2 fix report) against
 * `ts.createSourceFile`'s actual node shapes: a `TemplateHead`'s or `TemplateMiddle`'s
 * `getText()` ends with the `${` that opens the next span, and the following
 * `TemplateMiddle`/`TemplateTail`'s `getText()` begins with the matching `}` — so for
 * span `i`, the placeholder runs from two characters before the *previous* literal's
 * end (or `head.end` for the first span) through one character past the *current*
 * span's literal start.
 */
function placeholderRanges(node: ts.TemplateExpression, sf: ts.SourceFile, base: number, rawLength: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  node.templateSpans.forEach((span, i) => {
    const prevLiteralEnd = i === 0 ? node.head.end : node.templateSpans[i - 1].literal.end;
    const absStart = prevLiteralEnd - 2; // the '$' of '${'
    const absEnd = span.literal.getStart(sf) + 1; // one past the matching '}'
    const start = absStart - base;
    const end = absEnd - base;
    // Parser error-recovery on a truncated/unterminated template can place these
    // outside the actual text; skip or clamp rather than trust them blindly.
    if (start < 0 || start >= rawLength) return;
    ranges.push([start, Math.min(end, rawLength)]);
  });
  return ranges;
}

/**
 * The text of a template literal with its backtick(s) stripped, safe against a
 * genuinely unterminated literal (a truncated/malformed source file): the leading
 * backtick is always present (that's where the node starts), but the trailing one
 * is only stripped when it's actually there.
 */
function templateRaw(node: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression, sf: ts.SourceFile): string {
  const full = node.getText(sf);
  const hasClosingBacktick = full.length > 1 && full.endsWith('`');
  return hasClosingBacktick ? full.slice(1, -1) : full.slice(1);
}

/**
 * The text of an ordinary `'...'`/`"..."` string literal with its quote characters stripped
 * (I2 follow-through: markup written as a plain string — e.g. a ternary's empty-state branch,
 * `cart.items.length ? '' : '<p data-testid="cart-empty">...</p>'` — is exactly as real a
 * surface element as one written in a template literal; scanning only template literals would
 * silently drop it, the same under-extraction the element whitelist was widened to fix). Safe
 * against a genuinely unterminated string the same way `templateRaw` is.
 */
function stringLiteralRaw(node: ts.StringLiteral, sf: ts.SourceFile): string {
  const full = node.getText(sf);
  return full.length > 1 ? full.slice(1, -1) : full;
}

/**
 * Imported binding name → the resolved declaring file and the name the binding was declared
 * under there (its `propertyName` when renamed via `as`, otherwise the same local name), for
 * relative imports only. The declared name matters for I1: two distinct routers re-exported
 * under the same local alias must not collide with each other in the mounts map (see below).
 */
function importMap(file: string, sf: ts.SourceFile, texts: Map<string, string>): Map<string, { file: string; exportedName: string }> {
  const map = new Map<string, { file: string; exportedName: string }>();
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !n.importClause) return;
    const resolved = resolveRelative(file, n.moduleSpecifier.text, (p) => texts.has(p));
    if (!resolved) return;
    const clause = n.importClause;
    if (clause.name) map.set(clause.name.text, { file: resolved, exportedName: 'default' });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        map.set(el.name.text, { file: resolved, exportedName: (el.propertyName ?? el.name).text });
      }
    }
  });
  return map;
}

export function extractUi(repo: string, ref: string, suiteDir: string | null): Ui {
  const texts = appFiles(repo, ref, suiteDir);
  const parsed = new Map<string, ts.SourceFile>();
  const unparsed: string[] = [];
  for (const [f, t] of texts) {
    if (!SOURCE.test(f)) continue;
    try {
      const sf = parse(f, t);
      // Canary walk: `ui-surface` is the most exposed extractor (it walks every app file), so
      // a pathological one (a 5,000-term `||` chain, 2,000 nested `if`s, ...) must not poison
      // the whole run with a stack-overflowing `walk` call deep inside a later loop (I4) — flush
      // that failure out here, once, so every later walk over `parsed` is known-safe.
      walk(sf, () => {});
      parsed.set(f, sf);
    } catch {
      unparsed.push(f);
    }
  }

  // mounts: `${declaringFile}::${routerVarName}` → every prefix it is mounted under (from
  // `app.use('/prefix', routerVar)` / `app.use(routerVar)`), across the whole app — not just
  // one. Keyed by the router's own declared identity (I1), not by file alone: two distinct
  // routers declared in the same file must not collide on one map entry (each gets its own
  // key), and one router mounted more than once must keep every prefix, not just the last.
  const mounts = new Map<string, string[]>();
  const addMount = (key: string, prefix: string) => {
    const list = mounts.get(key) ?? [];
    list.push(prefix);
    mounts.set(key, list);
  };
  for (const [file, sf] of parsed) {
    const imports = importMap(file, sf, texts);
    const bindings = expressBindings(sf);
    const localRouters = routerVars(sf, bindings);
    walk(sf, (n) => {
      if (!ts.isCallExpression(n)) return;
      const c = calleeName(n);
      if (c?.method !== 'use') return;
      const [first, second] = n.arguments;
      const prefix = stringArg(first);
      const routerArg = prefix !== null ? second : first;
      if (!routerArg || !ts.isIdentifier(routerArg)) return;
      const name = routerArg.text;
      const imported = imports.get(name);
      if (imported) addMount(`${imported.file}::${imported.exportedName}`, prefix ?? '');
      else if (localRouters.has(name)) addMount(`${file}::${name}`, prefix ?? ''); // mounted where it's declared
    });
  }

  const routes: Route[] = [];
  const surface: SurfaceElement[] = [];
  for (const [file, sf] of parsed) {
    const bindings = expressBindings(sf);
    const routers = routerVars(sf, bindings);
    const apps = appVars(sf, bindings);
    // A route handler's mount point resolves either through the `routers`/`apps` sets
    // (found via express's real bindings, aliases included) or, as a last-resort
    // fallback, a literal `app` identifier — kept so an unresolvable app instance
    // (e.g. one passed in as a parameter) doesn't silently vanish.
    const isMountObject = (name: string) => routers.has(name) || apps.has(name) || name === 'app';
    // Every prefix this specific router was ever mounted under (in this file, where it is
    // declared) — one route is emitted per prefix, since every one of them is genuinely served.
    const prefixesFor = (object: string): string[] => {
      if (!routers.has(object)) return [''];
      const list = mounts.get(`${file}::${object}`);
      return list && list.length ? list : [''];
    };
    const pushRoute = (method: string, object: string, p: string, node: ts.Node) => {
      for (const prefix of prefixesFor(object)) {
        const full = prefix + p;
        routes.push({ method: method.toUpperCase(), path: full.replace(/\/{2,}/g, '/'), file, line: lineOf(sf, node), reach: [] });
      }
    };
    walk(sf, (n) => {
      if (ts.isCallExpression(n)) {
        const c = calleeName(n);
        const p = stringArg(n.arguments[0]);
        if (c?.object && HTTP_VERBS.has(c.method) && p?.startsWith('/') && isMountObject(c.object)) {
          pushRoute(c.method, c.object, p, n);
        } else if (c?.method && HTTP_VERBS.has(c.method) && ts.isPropertyAccessExpression(n.expression)) {
          // `router.route('/x').get(fn).post(fn)` (any number of chained verbs):
          // walk back down the chain past each `.verb(...)` link to the `.route(path)`
          // call it is ultimately hung off, and take the router/path from there.
          const base = findRouteChainBase(n.expression.expression);
          if (base && base.path.startsWith('/') && isMountObject(base.object)) {
            pushRoute(c.method, base.object, base.path, n);
          }
        }
      }
      if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
        const raw = templateRaw(n, sf);
        // I2: any element is a candidate now (html.ts's TAG regex was widened accordingly) —
        // this pre-filter must recognise the same superset, or a template literal built purely
        // from e.g. `<li>`/`<span>`/`<p>` (no form/input/button/a/select/textarea anywhere in
        // it) would be skipped here and never even reach `extractElements`, silently reinstating
        // the old whitelist's under-extraction one layer up.
        if (!/<[a-zA-Z][a-zA-Z0-9-]*\b/.test(raw)) return;
        const start = n.getStart(sf) + 1;
        const ranges = ts.isTemplateExpression(n) ? placeholderRanges(n, sf, start, raw.length) : [];
        surface.push(...extractElements(raw, file, (off) => sf.getLineAndCharacterOfPosition(start + off).line + 1, ranges));
      }
      if (ts.isStringLiteral(n)) {
        const raw = stringLiteralRaw(n, sf);
        if (!/<[a-zA-Z][a-zA-Z0-9-]*\b/.test(raw)) return;
        const start = n.getStart(sf) + 1;
        surface.push(...extractElements(raw, file, (off) => sf.getLineAndCharacterOfPosition(start + off).line + 1, []));
      }
    });
  }
  for (const [file, text] of texts) {
    if (!file.endsWith('.html')) continue;
    surface.push(...extractElements(text, file, (off) => text.slice(0, off).split('\n').length));
  }

  const reachCache = new Map<string, string[]>();
  for (const r of routes) {
    if (!reachCache.has(r.file)) reachCache.set(r.file, reachFrom(r.file, texts));
    r.reach = reachCache.get(r.file)!;
  }
  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return UiSchema.parse({ branch: ref, routes, surface, unparsed });
}

const USAGE = 'usage: ui-surface.ts --repo <dir> --branch <name> [--suite <dir>] --out <file>';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.repo || !args.branch || !args.out) fail(USAGE);
  try {
    // `--branch` accepts the same ticket-id form as every other extractor (I7); resolve here
    // so this script is runnable standalone, not only via extract-all.sh's pre-resolved name.
    const branch = resolveBranch(args.repo, args.branch);
    writeJson(args.out, extractUi(args.repo, branch, args.suite ?? null));
  } catch (err) {
    fail(formatError(err));
  }
}
