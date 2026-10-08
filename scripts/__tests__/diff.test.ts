import { describe, it, expect } from 'vitest';
import { FIXTURE, FEATURE } from './fixture';
import { computeDiff, parseUnifiedDiff } from '../diff';
import { DiffSchema } from '../schema';

describe('diff', () => {
  const diff = computeDiff(FIXTURE, 'PROJ-4821');

  it('validates against the schema', () => {
    expect(() => DiffSchema.parse(diff)).not.toThrow();
  });

  it('resolves branch, base and merge-base', () => {
    expect(diff.branch).toBe(FEATURE);
    expect(diff.base).toBe('main');
    expect(diff.mergeBase).toMatch(/^[0-9a-f]{40}$/);
    expect(diff.suiteDir).toBe('e2e');
  });

  it('lists exactly the behaviour-affecting changed files', () => {
    expect(diff.files.map((f) => f.file).sort()).toEqual([
      'api/openapi.yaml',
      'src/routes/cart.ts',
      'src/routes/checkout.ts',
      'src/services/cart.ts',
      'src/services/coupon.ts',
    ]);
  });

  it('marks new files as A with one whole-file hunk', () => {
    const coupon = diff.files.find((f) => f.file === 'src/services/coupon.ts')!;
    expect(coupon.status).toBe('A');
    expect(coupon.hunks).toHaveLength(1);
    expect(coupon.hunks[0].newStart).toBe(1);
    expect(coupon.hunks[0].lines.some((l) => l.includes('rawCode.toUpperCase()'))).toBe(true);
  });

  it('parses hunks of a modified file with zero context', () => {
    const cart = diff.files.find((f) => f.file === 'src/routes/cart.ts')!;
    expect(cart.status).toBe('M');
    const couponHunk = cart.hunks.find((h) => h.lines.some((l) => l.includes("'/api/cart/coupon'")))!;
    expect(couponHunk).toBeDefined();
    expect(couponHunk.newLines).toBeGreaterThan(5);
  });

  it('collects commits and the contract file', () => {
    expect(diff.commits).toHaveLength(1);
    expect(diff.commits[0].subject).toBe('Add coupon codes: percent and flat, one coupon per order');
    expect(diff.commits[0].body).toContain('PROJ-4821');
    expect(diff.contractFiles).toEqual(['api/openapi.yaml']);
  });
});

describe('parseUnifiedDiff', () => {
  it('keeps an added line whose content itself starts with "++", and excludes diff headers', () => {
    const raw = [
      'diff --git a/src/counter.ts b/src/counter.ts',
      'new file mode 100644',
      'index 0000000..abc1234',
      '--- /dev/null',
      '+++ b/src/counter.ts',
      '@@ -0,0 +1,2 @@',
      '+let counter = 0;',
      '+++counter;',
      '',
    ].join('\n');

    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(1);
    const file = files[0];
    expect(file.status).toBe('A');
    expect(file.hunks).toHaveLength(1);
    // The added line "++counter;" must survive — not be mistaken for a "+++" header.
    expect(file.hunks[0].lines).toContain('++counter;');
    // Diff headers themselves must never leak into the hunk's lines.
    expect(file.hunks[0].lines).not.toContain(' b/src/counter.ts');
    expect(file.hunks[0].lines.some((l) => l.includes('/dev/null'))).toBe(false);
    expect(file.hunks[0].lines).toEqual(['let counter = 0;', '++counter;']);
  });
});
