import ts from 'typescript';
import { listFiles, showFile, resolveBranch } from './lib/git';
import { parse, walk, calleeName, stringArg, resolveRelative } from './lib/ts-ast';
import { isSpecFile } from './lib/suite-dir';
import { parseArgs, writeJson, fail, isMain, wantsHelp, printUsage, formatError } from './lib/io';
import { SuiteSchema, type PageObjectFacts, type SpecFacts, type Suite } from './schema';

const LOCATORS = ['getByTestId', 'getByRole', 'getByLabel', 'getByText', 'getByPlaceholder', 'getByTitle', 'getByAltText', 'locator'];
const NAV = new Set(['goto', 'waitForURL', 'route']);
const REQUEST = new Set(['get', 'post', 'put', 'patch', 'delete', 'fetch', 'head']);

function suiteFiles(repo: string, ref: string, suiteDir: string): Map<string, string> {
  const texts = new Map<string, string>();
  for (const f of listFiles(repo, ref)) {
    if (!f.startsWith(suiteDir + '/') || !/\.[jt]sx?$/.test(f) || f.includes('node_modules/')) continue;
    const t = showFile(repo, ref, f);
    if (t !== null) texts.set(f, t);
  }
  return texts;
}

function importedFiles(file: string, sf: ts.SourceFile, texts: Map<string, string>): Map<string, string> {
  const map = new Map<string, string>(); // binding → file
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !n.importClause) return;
    const resolved = resolveRelative(file, n.moduleSpecifier.text, (p) => texts.has(p));
    if (!resolved) return;
    if (n.importClause.name) map.set(n.importClause.name.text, resolved);
    const nb = n.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) map.set(el.name.text, resolved);
  });
  return map;
}

/** Locator method → count, url literals, testId literals, plus whether any navigation is non-literal.
 * Scoped to whatever node is passed in: the whole source file for suite-wide aggregates, or a single
 * class declaration to keep one page object's facts from bleeding into another's (see `classesOf`). */
function scanCalls(node: ts.Node) {
  const locatorCounts: Record<string, number> = {};
  const assertionCounts: Record<string, number> = {};
  const urls = new Set<string>();
  const testIds = new Set<string>();
  let unresolved = false;
  let inlinePage = 0;
  walk(node, (n) => {
    if (!ts.isCallExpression(n)) return;
    const c = calleeName(n);
    if (!c) return;
    if (LOCATORS.includes(c.method)) {
      locatorCounts[c.method] = (locatorCounts[c.method] ?? 0) + 1;
      if (c.object === 'page') inlinePage++;
      if (c.method === 'getByTestId') {
        const id = stringArg(n.arguments[0]);
        if (id) testIds.add(id);
      }
    }
    if (c.method.startsWith('to') && /^expect\(/.test(c.object ?? '')) {
      assertionCounts[c.method] = (assertionCounts[c.method] ?? 0) + 1;
    }
    // Scoped to the `page` receiver (bare `page` in a spec, `this.page`/`x.page` inside a
    // page object) so a fixture method that happens to be named `goto` — every page object's
    // own `async goto() { await this.page.goto(...) }`, called elsewhere as `cart.goto()`,
    // `checkout.goto()`, etc. — isn't mistaken for a raw, unresolved page navigation just
    // because it also takes no arguments.
    const isNav = NAV.has(c.method) && /(^|\.)page$/.test(c.object ?? '');
    const isRequest = REQUEST.has(c.method) && /(^|\.)request$/.test(c.object ?? '');
    if (isNav || isRequest) {
      const u = stringArg(n.arguments[0]);
      if (u === null && ts.isRegularExpressionLiteral(n.arguments[0] ?? ({} as ts.Node))) return;
      if (u === null) unresolved = true;
      else if (!u.includes('${')) urls.add(u);
      else unresolved = true;
    }
  });
  return { locatorCounts, assertionCounts, urls: [...urls], testIds: [...testIds], unresolved, inlinePage };
}

/**
 * One `PageObjectFacts` per class declared in `file` (a file can export more than one page
 * object), with `scanCalls` scoped to each class's own node — not the whole file — so a
 * second class in the same file doesn't inherit the first's urls/testIds, and the first
 * doesn't get credited with the second's.
 */
function classesOf(file: string, sf: ts.SourceFile): PageObjectFacts[] {
  const out: PageObjectFacts[] = [];
  walk(sf, (n) => {
    if (!ts.isClassDeclaration(n) || !n.name) return;
    const methods = n.members.filter(ts.isMethodDeclaration).map((m) => (ts.isIdentifier(m.name) ? m.name.text : m.name.getText()));
    const scan = scanCalls(n);
    out.push({ file, className: n.name.text, methods, urls: scan.urls, testIds: scan.testIds, locatorCounts: scan.locatorCounts, unresolved: scan.unresolved });
  });
  return out;
}

/**
 * `key: async ({ page }, use) => { await use(new XPage(page)) }` inside `test.extend({...})`
 * → key → class name, plus (when the class is imported from a relative module we can resolve)
 * key → the file that declares it. The file mapping lets callers disambiguate two page-object
 * classes that happen to share a name (see `resolvePageObject`); when it can't be resolved
 * (e.g. the class is declared inline, or imported from a package) the key is simply absent
 * from `classFiles` and resolution falls back to a name-only match.
 */
function fixtureKeysOf(file: string, sf: ts.SourceFile, texts: Map<string, string>): { keys: Record<string, string>; classFiles: Record<string, string> } {
  const imports = importedFiles(file, sf, texts);
  const keys: Record<string, string> = {};
  const classFiles: Record<string, string> = {};
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const c = calleeName(n);
    if (c?.method !== 'extend') return;
    const arg = n.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
      let cls = '';
      walk(prop, (m) => {
        if (!cls && ts.isNewExpression(m) && ts.isIdentifier(m.expression)) cls = m.expression.text;
      });
      keys[prop.name.text] = cls;
      const target = imports.get(cls);
      if (target) classFiles[prop.name.text] = target;
    }
  });
  return { keys, classFiles };
}

/**
 * The suite's shared fixture module, if any: the first file (in two passes) whose
 * `test.extend({...})` yields fixture keys. Non-spec files are tried first so a spec that
 * defines its own local `test.extend` (e.g. for a fixture it alone needs) isn't mistaken for
 * the suite-wide fixture module — falling back to spec files only if no other file qualifies,
 * so a suite whose *only* `.extend` happens to live in a spec still gets one.
 */
function findFixtureModule(parsed: Map<string, ts.SourceFile>, texts: Map<string, string>): { file: string | null; keys: Record<string, string>; classFiles: Record<string, string> } {
  const passes = [
    [...parsed].filter(([f]) => !isSpecFile(f)),
    [...parsed].filter(([f]) => isSpecFile(f)),
  ];
  for (const entries of passes) {
    for (const [f, sf] of entries) {
      const { keys, classFiles } = fixtureKeysOf(f, sf, texts);
      if (Object.keys(keys).length) return { file: f, keys, classFiles };
    }
  }
  return { file: null, keys: {}, classFiles: {} };
}

/**
 * Page objects can delegate to other page objects (`OuterPage` constructs an `InnerPage` and
 * calls `this.inner.goto(id)`, where `InnerPage.goto` itself navigates non-literally) — a class's
 * own `scanCalls` only sees its own body, so this kind of unresolved-ness would otherwise never
 * reach the delegating class, let alone a spec that only ever touches `OuterPage`.
 *
 * Rather than type-resolving which property holds which page-object instance (real type
 * analysis, out of scope here), this over-approximates via a fixpoint over file-level imports,
 * reusing `importedFiles` (the same import-resolution machinery used everywhere else in this
 * module): a page object is `unresolved` if it already is, or if any page-object class declared
 * in a file it imports is `unresolved` — regardless of whether it actually calls into that
 * specific class. That over-marks (a page object importing an unresolved sibling it never
 * actually uses gets flagged too), which is the safe direction for a signal whose false negatives
 * wrongly exclude a spec from regression scope.
 *
 * Iterates to a fixed point (a single pass only propagates one hop per pass, so a 3-level
 * delegation chain needs 2 passes) bounded by the number of page objects, since a boolean flag
 * can only flip false→true once per object — with an explicit iteration cap as a belt-and-braces
 * guard against any unforeseen non-termination, not because the bound above can be exceeded.
 */
function propagateDelegatedUnresolved(pageObjectsByKey: Map<string, PageObjectFacts>, parsed: Map<string, ts.SourceFile>, texts: Map<string, string>): void {
  const importedFilesOf = new Map<string, Set<string>>(); // file → files it imports
  for (const [f, sf] of parsed) importedFilesOf.set(f, new Set(importedFiles(f, sf, texts).values()));

  const all = [...pageObjectsByKey.values()];
  const maxIterations = all.length + 1;
  for (let i = 0; i < maxIterations; i++) {
    let changed = false;
    for (const po of all) {
      if (po.unresolved) continue;
      const imports = importedFilesOf.get(po.file);
      if (!imports) continue;
      for (const other of all) {
        if (other !== po && imports.has(other.file) && other.unresolved) {
          po.unresolved = true;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * Resolve a page-object class name to its facts, preferring the exact file it was imported
 * from when known. Falls back to a suite-wide name match when the file can't be pinned down
 * (e.g. a barrel export) — safe as long as the name is unique across the suite, which is the
 * common case every consumer of `pageObjects` (name-keyed lookups) relies on. Two distinct
 * classes that legitimately share a name and whose file can't be resolved are dropped rather
 * than silently merged, since merging would reintroduce the class-scoping bug this exists to
 * avoid.
 */
/**
 * Resolution result, split from the found object itself: an ambiguous match (ties broken by
 * neither an exact file nor a unique name) still reports whether ANY candidate is unresolved,
 * so a spec that references a class we can't pin down (rather than dropping it) safely.
 */
function resolvePageObject(
  className: string,
  file: string | undefined,
  byKey: Map<string, PageObjectFacts>,
): { po: PageObjectFacts | undefined; unresolved: boolean } {
  if (file) {
    const exact = byKey.get(`${file}::${className}`);
    if (exact) return { po: exact, unresolved: exact.unresolved };
  }
  const matches = [...byKey.values()].filter((p) => p.className === className);
  if (matches.length === 1) return { po: matches[0], unresolved: matches[0].unresolved };
  // Ambiguous (or absent) match: two distinct classes sharing a name can't be safely merged
  // into one set of urls/testIds, but dropping the unresolved signal here would be the false-
  // negative direction — wrongly excluding a test from regression scope — so it is OR'd in
  // regardless of whether any single candidate can be pinned down.
  return { po: undefined, unresolved: matches.some((m) => m.unresolved) };
}

/**
 * Every test/describe title, nested titles joined with ' › '. Recognises `test`/`it` and
 * `test.only/skip/fixme`, plus `test.describe` and any `test.describe.<modifier>` chain
 * (`.serial`, `.parallel`, `.only`, `.skip`, ...): `calleeName` reports the *whole* object
 * expression's text for a multi-level property access, so `test.describe.serial(...)`
 * already comes back as `{ object: 'test.describe', method: 'serial' }` — the `object ===
 * 'test.describe'` check below matches regardless of which modifier follows, with no need to
 * enumerate them. `it.each(...)` is deliberately not special-cased: Playwright's `test`/`it`
 * has no Jest-style `.each`, so real Playwright suites don't produce this shape, and guessing
 * at array-driven titles for a form outside the target framework risks fabricating titles
 * rather than finding real ones.
 */
function titlesOf(sf: ts.SourceFile): string[] {
  const titles: string[] = [];
  const visit = (node: ts.Node, stack: string[]) => {
    if (ts.isCallExpression(node)) {
      const c = calleeName(node);
      const title = stringArg(node.arguments[0]);
      const isDescribe = c && (c.method === 'describe' || (c.object === 'test' && c.method === 'describe') || c.object === 'test.describe');
      const isTest = c && (c.method === 'test' || c.method === 'it' || (c.object === 'test' && ['only', 'skip', 'fixme'].includes(c.method)));
      if (title && isDescribe) {
        const inner = node.arguments[node.arguments.length - 1];
        if (inner) ts.forEachChild(inner, (ch) => visit(ch, [...stack, title]));
        return;
      }
      if (title && isTest) {
        titles.push([...stack, title].join(' › '));
        return;
      }
    }
    ts.forEachChild(node, (ch) => visit(ch, stack));
  };
  visit(sf, []);
  return titles;
}

function specFacts(
  file: string,
  sf: ts.SourceFile,
  texts: Map<string, string>,
  parsed: Map<string, ts.SourceFile>,
  fixtureKeys: Record<string, string>,
  fixtureClassFiles: Record<string, string>,
  pageObjectsByKey: Map<string, PageObjectFacts>,
): SpecFacts {
  const imports = importedFiles(file, sf, texts);
  const scan = scanCalls(sf);
  const fixtures = new Set<string>();
  const methodCalls = new Set<string>();
  const literals = new Set<string>();
  const pageObjectNames = new Set<string>();
  const poRefs: Array<{ className: string; file?: string }> = [];

  walk(sf, (n) => {
    // destructured fixtures in test callbacks: test('…', async ({ cart, checkout }) => …)
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parameters[0] && ts.isObjectBindingPattern(n.parameters[0].name)) {
      for (const el of n.parameters[0].name.elements) if (ts.isIdentifier(el.name)) fixtures.add(el.name.text);
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && imports.has(n.expression.text)) {
      pageObjectNames.add(n.expression.text);
      poRefs.push({ className: n.expression.text, file: imports.get(n.expression.text) });
    }
    if (ts.isCallExpression(n)) {
      const c = calleeName(n);
      if (c?.object && !c.object.includes('(') && (fixtures.has(c.object) || fixtureKeys[c.object])) {
        methodCalls.add(`${c.object}.${c.method}`);
        for (const a of n.arguments) {
          if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isNumericLiteral(a)) literals.add(a.text);
        }
      }
    }
  });

  for (const f of fixtures) {
    if (!fixtureKeys[f]) continue;
    pageObjectNames.add(fixtureKeys[f]);
    poRefs.push({ className: fixtureKeys[f], file: fixtureClassFiles[f] });
  }

  // transitive unresolved: any imported suite module (helpers, page objects) with non-literal navigation
  let unresolved = scan.unresolved;
  const urls = new Set(scan.urls);
  const testIds = new Set(scan.testIds);
  for (const target of new Set(imports.values())) {
    if (isSpecFile(target)) continue;
    // Reuse the suite-wide parse `extractSuite` already built (I9) instead of re-parsing —
    // in a 500-spec suite sharing a handful of helpers, this was ~2,000 redundant parses.
    // A target absent here was one that failed to parse at all (I4) and was already recorded
    // in `unparsed`; skip it rather than re-parsing (and re-risking the same failure).
    const parsedTarget = parsed.get(target);
    if (!parsedTarget) continue;
    const s = scanCalls(parsedTarget);
    if (s.unresolved) unresolved = true;
    for (const u of s.urls) urls.add(u);
    for (const id of s.testIds) testIds.add(id);
  }
  for (const ref of poRefs) {
    const { po, unresolved: refUnresolved } = resolvePageObject(ref.className, ref.file, pageObjectsByKey);
    // A page object obtained through a fixture key is reached ONLY through this loop (the
    // transitive-import loop above never sees it, since the spec imports the fixture module,
    // not the page-object file directly) — so its own `unresolved` (e.g. a template-literal
    // `this.page.goto(...)` inside one of its methods) must be OR'd in here, or it is lost
    // entirely for every fixture-obtained page object. It must be OR'd in even when `po` itself
    // is undefined (an ambiguous same-named match) — that is the false-negative direction that
    // wrongly excludes a test from regression scope.
    if (refUnresolved) unresolved = true;
    if (!po) continue;
    for (const u of po.urls) urls.add(u);
    for (const id of po.testIds) testIds.add(id);
  }

  return {
    path: file,
    tests: titlesOf(sf),
    imports: [...new Set(imports.values())].sort(),
    pageObjects: [...pageObjectNames].sort(),
    urls: [...urls].sort(),
    fixtures: [...fixtures].filter((f) => f !== 'page' && f !== 'request' && f !== 'context').sort(),
    methodCalls: [...methodCalls].sort(),
    literals: [...literals].sort(),
    testIds: [...testIds].sort(),
    unresolved,
  };
}

export function extractSuite(repo: string, ref: string, suiteDir: string): Suite {
  const texts = suiteFiles(repo, ref, suiteDir);
  const parsed = new Map<string, ts.SourceFile>();
  const unparsed: string[] = [];
  for (const [f, t] of texts) {
    try {
      const sf = parse(f, t);
      // Canary walk (I4): a pathological spec/page-object file (a huge `||` chain, deeply
      // nested `if`s, ...) can blow the stack inside `walk`'s recursion. Surfacing that here,
      // once per file, means the rest of the suite still gets extracted instead of one bad
      // file silently producing an empty `suite.json`.
      walk(sf, () => {});
      parsed.set(f, sf);
    } catch {
      unparsed.push(f);
    }
  }

  const { file: fixtureFile, keys: fixtureKeys, classFiles: fixtureClassFiles } = findFixtureModule(parsed, texts);

  const pageObjectsByKey = new Map<string, PageObjectFacts>(); // `${file}::${className}` → facts
  for (const [f, sf] of parsed) {
    if (isSpecFile(f) || f === fixtureFile) continue;
    for (const facts of classesOf(f, sf)) pageObjectsByKey.set(`${f}::${facts.className}`, facts);
  }
  propagateDelegatedUnresolved(pageObjectsByKey, parsed, texts);

  const specs: SpecFacts[] = [];
  for (const [f, sf] of parsed) if (isSpecFile(f)) specs.push(specFacts(f, sf, texts, parsed, fixtureKeys, fixtureClassFiles, pageObjectsByKey));
  specs.sort((a, b) => a.path.localeCompare(b.path));

  const locatorCounts: Record<string, number> = {};
  const assertionCounts: Record<string, number> = {};
  let inlineLocatorCalls = 0;
  for (const [f, sf] of parsed) {
    const s = scanCalls(sf);
    for (const [k, v] of Object.entries(s.locatorCounts)) locatorCounts[k] = (locatorCounts[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.assertionCounts)) assertionCounts[k] = (assertionCounts[k] ?? 0) + v;
    if (isSpecFile(f)) inlineLocatorCalls += s.inlinePage;
  }

  // storageState/globalSetup can be declared anywhere in the suite, so scanning is fine either
  // way; the beforeEach→login proximity check must NOT cross file boundaries — a `beforeEach`
  // at the end of one file has no business "seeing" a `login(` at the start of the next, which
  // is exactly what testing the '\n'-joined text of every file would do.
  const fileTexts = [...texts.values()];
  const setupPattern = fileTexts.some((t) => /storageState/.test(t))
    ? 'storageState'
    : fileTexts.some((t) => /globalSetup/.test(t))
    ? 'globalSetup'
    : fileTexts.some((t) => /beforeEach[\s\S]{0,200}(login|signIn)\w*\(/.test(t))
    ? 'beforeEach'
    : 'none';
  const obtainPattern = fixtureFile ? 'test.extend' : specs.some((s) => s.pageObjects.length) ? 'constructor' : 'unknown';

  return SuiteSchema.parse({
    branch: ref,
    suiteDir,
    specs,
    pageObjects: [...pageObjectsByKey.values()].sort((a, b) => a.className.localeCompare(b.className) || a.file.localeCompare(b.file)),
    fixtureFile,
    fixtureKeys,
    obtainPattern,
    locatorCounts,
    inlineLocatorCalls,
    assertionCounts,
    titleSamples: specs.map((s) => s.tests[0]).filter(Boolean).slice(0, 5), // one per file: more representative than 5 from whichever file sorts first
    setupPattern,
    totalTests: specs.reduce((n, s) => n + s.tests.length, 0),
    unparsed,
  });
}

const USAGE = 'usage: suite-facts.ts --repo <dir> --branch <name> --suite <dir> --out <file>';

if (isMain(__filename)) {
  const args = parseArgs(process.argv.slice(2));
  if (wantsHelp(args)) printUsage(USAGE);
  if (!args.repo || !args.branch || !args.suite || !args.out) fail(USAGE);
  try {
    // `--branch` accepts the ticket-id form every other extractor does (I7), so this script is
    // runnable standalone rather than only via extract-all.sh's pre-resolved name.
    const branch = resolveBranch(args.repo, args.branch);
    writeJson(args.out, extractSuite(args.repo, branch, args.suite));
  } catch (err) {
    fail(formatError(err));
  }
}
