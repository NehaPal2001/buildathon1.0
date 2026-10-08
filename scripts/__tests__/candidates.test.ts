import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { FIXTURE } from './fixture';
import { makeRepo } from './make-repo';
import { computeDiff } from '../diff';
import { extractCandidates, extractCodeCandidates, collectFromSource } from '../candidates';
import { CandidatesSchema, type Candidate, type CandidatesFile, type Diff } from '../schema';
import { showFile } from '../lib/git';

// `await` works whether extractCandidates is sync (Task 4) or async (Task 5).
let out: CandidatesFile;
beforeAll(async () => {
  out = await extractCandidates(FIXTURE, computeDiff(FIXTURE, 'PROJ-4821'));
});
const code = () => out.candidates.filter((c) => c.source === 'code');

function at(file: string, needle: string): Candidate[] {
  return code().filter((c) => c.file === file && c.excerpt.includes(needle));
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

type Cited = Pick<Candidate, 'source' | 'excerpt' | 'line'>;

/**
 * The citation invariant: the excerpt is genuinely a contiguous piece of the
 * file (modulo whitespace) and the cited line is where the construct starts.
 * Applies to every candidate, contract included (C1+C2): a contract excerpt
 * is now sliced directly from the raw CST, not composed, so it must satisfy
 * exactly the same check code candidates always have.
 */
function citesRealSource(text: string, c: Cited): boolean {
  if (!norm(text).includes(norm(c.excerpt))) return false;
  const line = text.split('\n')[c.line - 1] ?? '';
  const firstToken = norm(c.excerpt).split(' ')[0];
  return line.includes(firstToken);
}

function citationHolds(c: Candidate): boolean {
  const text = showFile(FIXTURE, 'feature/PROJ-4821', c.file)!;
  return citesRealSource(text, c);
}

describe('code candidates', () => {
  it('validates and has sequential ids', () => {
    expect(() => CandidatesSchema.parse(out)).not.toThrow();
    expect(out.candidates.map((c) => c.id)).toEqual(out.candidates.map((_, i) => `c-${i + 1}`));
  });

  it('finds the uppercase normalisation as a default', () => {
    const [c] = at('src/services/coupon.ts', 'rawCode.toUpperCase()');
    expect(c.kind).toBe('default');
    expect(c.enclosingFunction).toBe('applyCoupon');
    expect(citationHolds(c)).toBe(true);
  });

  it('finds the invalid, expired and below-minimum guards as conditions', () => {
    expect(at('src/services/coupon.ts', 'if (!coupon)')[0].kind).toBe('condition');
    expect(at('src/services/coupon.ts', 'coupon.expiresOn')[0].kind).toBe('condition');
    expect(at('src/services/coupon.ts', 'cartSubtotal < coupon.minCart')[0].kind).toBe('condition');
  });

  it('finds the unhandled throw (plant 3) with no status', () => {
    const [c] = at('src/services/coupon.ts', "throw new Error('cart below minimum')");
    expect(c.kind).toBe('throw');
    expect(c.status).toBeUndefined();
    expect(citationHolds(c)).toBe(true);
  });

  it('finds the coupon errors as throws with a status', () => {
    const [c] = at('src/services/coupon.ts', "CouponError('INVALID_CODE', 400)");
    expect(c.kind).toBe('throw');
    expect(c.status).toBe(400);
    // exactly one candidate for that line — the inner call is not double-counted
    expect(code().filter((x) => x.file === c.file && x.line === c.line)).toHaveLength(1);
  });

  it('finds the BOGO enum in the type union and the switch case (plant 4)', () => {
    const union = at('src/services/coupon.ts', "'BOGO'").find((c) => c.kind === 'enum');
    expect(union?.excerpt).toBe("'PERCENT' | 'FLAT' | 'BOGO'");
    const kase = at('src/services/cart.ts', "case 'BOGO':");
    expect(kase[0].kind).toBe('condition');
  });

  it('attaches the route to candidates inside a route handler', () => {
    const [c] = at('src/routes/cart.ts', 'err instanceof CouponError');
    expect(c.route).toEqual({ method: 'POST', path: '/api/cart/coupon' });
  });

  it('never emits candidates outside changed hunks', () => {
    // base cart.ts already had this guard; it is untouched on the branch
    expect(at('src/routes/cart.ts', '!products.some(')).toHaveLength(0);
  });

  it('records identifiers and context', () => {
    const [c] = at('src/services/coupon.ts', 'rawCode.toUpperCase()');
    expect(c.identifiers).toContain('rawCode');
    expect(c.context.split('\n').length).toBeGreaterThanOrEqual(3);
  });
});

describe('contract candidates', () => {
  const contract = () => out.candidates.filter((c) => c.source === 'contract');

  it('records the added coupon operation as a contract change', () => {
    expect(out.contractChanges).toContainEqual(
      expect.objectContaining({ path: '/api/cart/coupon', method: 'POST', change: 'added' }),
    );
  });

  it('extracts the code pattern constraint (plant 2) with route and line', () => {
    const c = contract().find((x) => x.rule?.includes('^[A-Z0-9]{6,12}$') && x.field === 'code')!;
    expect(c).toBeDefined();
    expect(c.route).toEqual({ method: 'POST', path: '/api/cart/coupon' });
    expect(c.file).toBe('api/openapi.yaml');
    const text = showFile(FIXTURE, 'feature/PROJ-4821', 'api/openapi.yaml')!;
    expect(text.split('\n')[c.line - 1]).toContain('pattern');
  });

  it('extracts the documented 422 as a constraint (plant 3)', () => {
    const c = contract().find((x) => x.rule?.startsWith('response 422'))!;
    expect(c.rule).toContain('CART_BELOW_MINIMUM');
    expect(c.route?.path).toBe('/api/cart/coupon');
  });

  it('cites the actual description line for the 422, not the status key (C1/C2)', () => {
    // Before the fix this cited line 124 (`'422':`) while claiming the description text as
    // the excerpt — that text lives on line 125 and never appeared on the cited line.
    const c = contract().find((x) => x.rule?.startsWith('response 422'))!;
    const text = showFile(FIXTURE, 'feature/PROJ-4821', 'api/openapi.yaml')!;
    expect(text.split('\n')[c.line - 1]).toContain('CART_BELOW_MINIMUM');
    expect(c.excerpt).toContain('CART_BELOW_MINIMUM');
  });

  it('extracts the discountType enum from the changed Coupon schema (plant 4)', () => {
    const c = contract().find((x) => x.field === 'Coupon.discountType')!;
    expect(c.rule).toBe('enum: PERCENT, FLAT, BOGO');
  });

  it('does not emit constraints for unchanged operations', () => {
    // /api/cart/items is untouched on the branch but has real constraints
    // (minimum: 1, required: [productId]) — an implementation that walked
    // every operation instead of scoping to the diff would still emit these
    // and this assertion would catch it (unlike /api/products, which has no
    // constraints at all and would pass even against an unscoped walk).
    expect(contract().some((x) => x.route?.path === '/api/cart/items')).toBe(false);
  });

  it('every contract candidate satisfies the same citation invariant code candidates do (C1)', () => {
    expect(contract().length).toBeGreaterThan(0);
    for (const c of contract()) expect(citationHolds(c)).toBe(true);
  });

  it('renders required/pattern/enum excerpts verbatim as they appear in the source, not composed (C1)', () => {
    // c-1/c-2/c-6 from the review: the old `excerpt: c.rule` fabricated
    // `required: code` / `pattern: ^...$` / `enum: A, B, C` — none of which appear literally
    // in the YAML, which spells them `required: [code]`, `pattern: '^...$'`, `enum: [A, B, C]`.
    const required = contract().find((x) => x.field === '(body)' && x.route?.path === '/api/cart/coupon')!;
    expect(required.excerpt).toBe('required: [code]');
    const pattern = contract().find((x) => x.field === 'code' && x.route?.path === '/api/cart/coupon')!;
    expect(pattern.excerpt).toBe("pattern: '^[A-Z0-9]{6,12}$'");
    const enumC = contract().find((x) => x.field === 'Coupon.discountType')!;
    expect(enumC.excerpt).toBe('enum: [PERCENT, FLAT, BOGO]');
  });
});

describe('regression: review findings on candidates.ts', () => {
  it('cites the real source for a wrapped if condition (finding 1)', () => {
    const src = [
      'export function f(a: number, b: number): number {',
      '  if (',
      '    a > 0 &&',
      '    b > 0',
      '  ) {',
      '    return 1;',
      '  }',
      '  return 0;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-wrapped-if.ts', src, [[1, src.split('\n').length]]);
    const [c] = drafts.filter((d) => d.kind === 'condition');
    expect(c).toBeDefined();
    // the fabricated-excerpt bug cited line 2 (`  if (`) while claiming the
    // excerpt was the whole multi-line condition — that text never appears
    // verbatim in the file, and line 2 alone does not contain it.
    expect(citesRealSource(src, c)).toBe(true);
  });

  it('captures both the switch case and the default clause (finding 2)', () => {
    const src = [
      "export function f(x: string): number {",
      '  switch (x) {',
      "    case 'A':",
      '      return 1;',
      '    default:',
      '      return 0;',
      '  }',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-switch.ts', src, [[1, src.split('\n').length]]);
    const conditions = drafts.filter((d) => d.kind === 'condition');
    expect(conditions.some((d) => d.excerpt === "case 'A':")).toBe(true);
    expect(conditions.some((d) => d.excerpt === 'default:')).toBe(true);
  });

  it('captures a bare comparison used as a predicate (finding 3)', () => {
    const src = [
      'const items: { id: number }[] = [];',
      'const found = items.find((p) => p.id === 1);',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-predicate.ts', src, [[1, src.split('\n').length]]);
    expect(drafts.some((d) => d.kind === 'condition' && d.excerpt.includes('p.id === 1'))).toBe(true);
  });

  it('does not double-count a comparison already inside an if (finding 3)', () => {
    const src = 'if (a === b) { c(); }\n';
    const drafts = collectFromSource('synthetic-if-comparison.ts', src, [[1, 1]]);
    expect(drafts.filter((d) => d.kind === 'condition')).toHaveLength(1);
  });

  it('emits only the outermost link of an || chain (finding 4)', () => {
    const src = 'const x = a || b || c;\n';
    const drafts = collectFromSource('synthetic-or-chain.ts', src, [[1, 1]]);
    const defaults = drafts.filter((d) => d.kind === 'default');
    expect(defaults).toHaveLength(1);
    expect(defaults[0].excerpt).toBe('a || b || c');
  });

  it('does not flag Math normalisers as defaults (minor)', () => {
    const src = 'const y = Math.round(x);\n';
    const drafts = collectFromSource('synthetic-math.ts', src, [[1, 1]]);
    expect(drafts.some((d) => d.excerpt.includes('Math.round'))).toBe(false);
  });
});

describe('regression: M1 final review fixes on candidates.ts', () => {
  it('scopes identifiers to the excerpt span only, not the if statement’s whole subtree (I3)', () => {
    const src = [
      'export function f(a: number, b: number): number {',
      '  if (a > 0) {',
      '    const c = b + a;',
      '    return c;',
      '  }',
      '  return 0;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-if-identifiers.ts', src, [[1, src.split('\n').length]]);
    const [c] = drafts.filter((d) => d.kind === 'condition');
    expect(c.excerpt).toBe('if (a > 0)');
    // 'b' and 'c' appear only in the consequent block, never in the condition itself — the
    // pre-fix bug (identifiersIn(node) over the whole IfStatement) would include them.
    expect(c.identifiers).toEqual(['a']);
  });

  it('scopes identifiers to a case clause’s own excerpt, not its statements (I3)', () => {
    const src = [
      "export function f(x: string, y: number): number {",
      '  switch (x) {',
      "    case 'A':",
      '      return y + 1;',
      '  }',
      '  return 0;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-case-identifiers.ts', src, [[1, src.split('\n').length]]);
    const kase = drafts.find((d) => d.kind === 'condition' && d.excerpt.startsWith('case'))!;
    expect(kase.identifiers).toEqual([]); // `x` is the switch discriminant, not part of `case 'A':`; `y` is in the body
  });

  it('emits a condition candidate for a for-loop header, without double-counting its own comparison (I8)', () => {
    const src = [
      'export function f(n: number): number {',
      '  let total = 0;',
      '  for (let i = 0; i < n; i++) {',
      '    total += i;',
      '  }',
      '  return total;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-for.ts', src, [[1, src.split('\n').length]]);
    const conditions = drafts.filter((d) => d.kind === 'condition');
    // exactly one: the loop header itself — `i < n` must not ALSO produce its own candidate,
    // since it already did before this fix (via the bare-comparison rule).
    expect(conditions).toHaveLength(1);
    expect(conditions[0].excerpt).toBe('for (let i = 0; i < n; i++)');
    expect(citesRealSource(src, conditions[0])).toBe(true);
  });

  it('emits a condition candidate for a for...of loop header (I8)', () => {
    const src = [
      'export function f(list: string[]): number {',
      '  let n = 0;',
      '  for (const x of list) {',
      '    n++;',
      '  }',
      '  return n;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-for-of.ts', src, [[1, src.split('\n').length]]);
    const loop = drafts.find((d) => d.kind === 'condition' && d.excerpt.startsWith('for'))!;
    expect(loop.excerpt).toBe('for (const x of list)');
    expect(citesRealSource(src, loop)).toBe(true);
  });

  it('emits a condition candidate for a while loop header (I8)', () => {
    const src = [
      'export function f(n: number): number {',
      '  let i = 0;',
      '  while (i < n) {',
      '    i++;',
      '  }',
      '  return i;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-while.ts', src, [[1, src.split('\n').length]]);
    const loop = drafts.find((d) => d.excerpt === 'while (i < n)');
    expect(loop).toBeDefined();
    expect(loop!.kind).toBe('condition');
  });

  it('emits a condition candidate for a do...while loop, anchored on the trailing while(...) (I8)', () => {
    const src = [
      'export function f(n: number): number {',
      '  let i = 0;',
      '  do {',
      '    i++;',
      '  } while (i < n);',
      '  return i;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-do-while.ts', src, [[1, src.split('\n').length]]);
    const loop = drafts.find((d) => d.excerpt.startsWith('while'))!;
    expect(loop.excerpt).toBe('while (i < n)');
    expect(citesRealSource(src, loop)).toBe(true);
  });

  it('emits a default candidate for a mutating call that accumulates onto a local binding (I8)', () => {
    const src = [
      'export function f(codes: string[]): string[] {',
      '  const list: string[] = [];',
      '  for (const code of codes) {',
      '    list.push(code);',
      '  }',
      '  return list;',
      '}',
      '',
    ].join('\n');
    const drafts = collectFromSource('synthetic-accumulate.ts', src, [[1, src.split('\n').length]]);
    const push = drafts.find((d) => d.excerpt === 'list.push(code)');
    expect(push).toBeDefined();
    expect(push!.kind).toBe('default');
  });

  it('does not flag a property-access receiver (e.g. this.items) as an accumulated local', () => {
    const src = 'export function f(x: string) { this.items.push(x); }\n';
    const drafts = collectFromSource('synthetic-accumulate-this.ts', src, [[1, 1]]);
    expect(drafts.some((d) => d.excerpt.includes('.push('))).toBe(false);
  });

  it('reproduces the fixture’s own stacking-plant lines as candidates (I8)', () => {
    // src/services/cart.ts:19 (`for (const code of appliedCoupons(cart))`) and
    // src/services/coupon.ts:49 (`list.push(coupon.code)`) are the honest, precise origin of
    // "two coupons can stack" — before this fix, neither produced any candidate at all.
    const cartSrc = [
      'export function discount(cart: { items: unknown[] }): number {',
      '  let off = 0;',
      '  for (const code of appliedCoupons(cart)) {',
      '    off += 1;',
      '  }',
      '  return off;',
      '}',
      'declare function appliedCoupons(cart: unknown): string[];',
      '',
    ].join('\n');
    const cartDrafts = collectFromSource('src/services/cart.ts', cartSrc, [[1, cartSrc.split('\n').length]]);
    expect(cartDrafts.some((d) => d.kind === 'condition' && d.excerpt === 'for (const code of appliedCoupons(cart))')).toBe(true);

    const couponSrc = [
      'export function applyCoupon(list: string[], coupon: { code: string }): string[] {',
      '  list.push(coupon.code);',
      '  return list;',
      '}',
      '',
    ].join('\n');
    const couponDrafts = collectFromSource('src/services/coupon.ts', couponSrc, [[1, couponSrc.split('\n').length]]);
    expect(couponDrafts.some((d) => d.kind === 'default' && d.excerpt === 'list.push(coupon.code)')).toBe(true);
  });
});

describe('I4: a pathological file does not poison the whole extraction run', () => {
  // A 5,000-term `||` chain (the review's own example) parses fine but builds a left-deep AST
  // 5,000 levels deep; `walk`'s plain recursion over it reliably blows the default stack.
  const term = Array.from({ length: 5000 }, (_, i) => `x${i}`).join(' || ');
  const badSrc = `export const bad = ${term};\n`;
  const goodSrc = 'export function ok(a: number, b: number): number {\n  if (a > b) {\n    return a;\n  }\n  return b;\n}\n';
  const repos: string[] = [];

  afterAll(() => {
    for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records the pathological file in `unparsed` and still extracts candidates from the rest of the branch', () => {
    const dir = makeRepo({ 'src/bad.ts': badSrc, 'src/good.ts': goodSrc });
    repos.push(dir);
    const diff: Diff = {
      branch: 'main',
      base: 'main',
      mergeBase: 'main',
      suiteDir: null,
      files: [
        { file: 'src/bad.ts', status: 'A', hunks: [] },
        { file: 'src/good.ts', status: 'A', hunks: [] },
      ],
      commits: [],
      contractFiles: [],
    };
    expect(() => extractCodeCandidates(dir, diff)).not.toThrow();
    const { drafts, unparsed } = extractCodeCandidates(dir, diff);
    expect(unparsed).toEqual(['src/bad.ts']);
    expect(drafts.some((d) => d.file === 'src/good.ts' && d.kind === 'condition')).toBe(true);
    expect(drafts.some((d) => d.file === 'src/bad.ts')).toBe(false);
  });

  it('propagates unparsed through extractCandidates end to end, still schema-valid', async () => {
    const dir = makeRepo({ 'src/bad.ts': badSrc, 'src/good.ts': goodSrc });
    repos.push(dir);
    const diff: Diff = {
      branch: 'main',
      base: 'main',
      mergeBase: 'main',
      suiteDir: null,
      files: [
        { file: 'src/bad.ts', status: 'A', hunks: [] },
        { file: 'src/good.ts', status: 'A', hunks: [] },
      ],
      commits: [],
      contractFiles: [],
    };
    const result = await extractCandidates(dir, diff);
    expect(() => CandidatesSchema.parse(result)).not.toThrow();
    expect(result.unparsed).toEqual(['src/bad.ts']);
    expect(result.candidates.some((c) => c.file === 'src/good.ts')).toBe(true);
  });
});
