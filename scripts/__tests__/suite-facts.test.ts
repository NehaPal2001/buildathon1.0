import { describe, it, expect } from 'vitest';
import { FIXTURE, FEATURE } from './fixture';
import { makeRepo } from './make-repo';
import { extractSuite } from '../suite-facts';
import { SuiteSchema } from '../schema';

describe('suite-facts', () => {
  const suite = extractSuite(FIXTURE, FEATURE, 'e2e');
  const spec = (name: string) => suite.specs.find((s) => s.path.endsWith(`/${name}.spec.ts`))!;

  it('validates and counts 42 tests across 8 spec files', () => {
    expect(() => SuiteSchema.parse(suite)).not.toThrow();
    expect(suite.specs).toHaveLength(8);
    expect(suite.totalTests).toBe(42);
  });

  it('records nested titles', () => {
    expect(spec('coupon').tests).toEqual([
      'Coupons › a percent coupon reduces the total',
      'Coupons › a flat coupon reduces the total',
      'Coupons › an invalid code shows an error',
    ]);
  });

  it('maps fixtures to page objects through test.extend', () => {
    expect(suite.obtainPattern).toBe('test.extend');
    expect(suite.fixtureFile).toBe('e2e/fixtures.ts');
    expect(suite.fixtureKeys).toMatchObject({ cart: 'CartPage', checkout: 'CheckoutPage' });
    expect(spec('coupon').fixtures).toEqual(['cart', 'checkout']);
    expect(spec('coupon').pageObjects).toEqual(['CartPage', 'CheckoutPage']);
  });

  it('merges page-object urls and test ids into the spec', () => {
    const coupon = spec('coupon');
    expect(coupon.urls).toEqual(expect.arrayContaining(['/checkout', '/api/cart/items']));
    expect(coupon.testIds).toEqual(expect.arrayContaining(['coupon-input', 'discount', 'applied-${code}']));
    expect(coupon.methodCalls).toEqual(expect.arrayContaining(['cart.addProduct', 'checkout.applyCoupon']));
    expect(coupon.literals).toEqual(expect.arrayContaining(['SAVE20', 'FLAT100', 'BADCODE', 'p3']));
  });

  it('marks only smoke.spec.ts as unresolved', () => {
    expect(spec('smoke').unresolved).toBe(true);
    expect(suite.specs.filter((s) => s.unresolved).map((s) => s.path)).toEqual(['e2e/specs/smoke.spec.ts']);
  });

  it('keeps out-of-scope specs free of cart/checkout facts', () => {
    for (const name of ['catalogue', 'search', 'account', 'orders']) {
      const s = spec(name);
      expect(s.urls.some((u) => u.startsWith('/cart') || u.startsWith('/checkout') || u.startsWith('/api/cart'))).toBe(false);
      expect(s.pageObjects).not.toContain('CartPage');
    }
  });

  it('lists page-object methods for the generator', () => {
    const checkout = suite.pageObjects.find((p) => p.className === 'CheckoutPage')!;
    expect(checkout.methods).toEqual(expect.arrayContaining(['goto', 'applyCoupon', 'appliedCoupon', 'placeOrder']));
    expect(checkout.file).toBe('e2e/pages/CheckoutPage.ts');
  });

  it('ranks locator and assertion usage', () => {
    expect(suite.locatorCounts.getByTestId).toBeGreaterThan(suite.locatorCounts.getByRole);
    expect(suite.assertionCounts.toBeVisible).toBeGreaterThan(0);
    expect(suite.setupPattern).toBe('none');
    expect(suite.titleSamples.length).toBeGreaterThanOrEqual(3);
    expect(suite.inlineLocatorCalls).toBe(4); // shared page chrome in smoke.spec.ts and catalogue.spec.ts
  });
});

// --- Controller-flagged defects (A-E): each reproduced against a disposable temp repo ---
// (the demo-shop fixture can't express these shapes: two classes in one file, duplicate
// class names across files, a spec-local test.extend racing the real fixture module, or a
// cross-file setup false positive) before being fixed in suite-facts.ts.

describe('suite-facts: class scoping (defect A)', () => {
  it('gives each class in a shared file its own urls/testIds instead of bleeding into the first', () => {
    const dir = makeRepo({
      'e2e/pages/Both.ts': `
        import type { Page } from '@playwright/test';
        export class AlphaPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/alpha'); }
          async click() { await this.page.getByTestId('alpha-btn').click(); }
        }
        export class BetaPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/beta'); }
          async click() { await this.page.getByTestId('beta-btn').click(); }
        }
      `,
      'e2e/fixtures.ts': `
        import { test as base } from '@playwright/test';
        import { AlphaPage } from './pages/Both';
        import { BetaPage } from './pages/Both';
        export const test = base.extend<{ alpha: AlphaPage; beta: BetaPage }>({
          alpha: async ({ page }, use) => { await use(new AlphaPage(page)); },
          beta: async ({ page }, use) => { await use(new BetaPage(page)); },
        });
        export { expect } from '@playwright/test';
      `,
      'e2e/specs/both.spec.ts': `
        import { test } from '../fixtures';
        test('uses both', async ({ alpha, beta }) => {
          await alpha.goto();
          await beta.goto();
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.pageObjects.map((p) => p.className).sort()).toEqual(['AlphaPage', 'BetaPage']);

    const alpha = suite.pageObjects.find((p) => p.className === 'AlphaPage')!;
    const beta = suite.pageObjects.find((p) => p.className === 'BetaPage')!;
    expect(alpha.urls).toEqual(['/alpha']);
    expect(alpha.testIds).toEqual(['alpha-btn']);
    expect(beta.urls).toEqual(['/beta']);
    expect(beta.testIds).toEqual(['beta-btn']);

    const spec = suite.specs[0];
    expect(spec.urls.sort()).toEqual(['/alpha', '/beta']);
    expect(spec.testIds.sort()).toEqual(['alpha-btn', 'beta-btn']);
  });
});

describe('suite-facts: duplicate class names across files (defect B)', () => {
  it('keeps both same-named classes and resolves each spec to the right one via its import', () => {
    const dir = makeRepo({
      'e2e/pages/one/WidgetPage.ts': `
        import type { Page } from '@playwright/test';
        export class WidgetPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/one'); }
        }
      `,
      'e2e/pages/two/WidgetPage.ts': `
        import type { Page } from '@playwright/test';
        export class WidgetPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/two'); }
        }
      `,
      'e2e/fixtures.ts': `
        import { test as base } from '@playwright/test';
        import { WidgetPage } from './pages/one/WidgetPage';
        export const test = base.extend<{ widget: WidgetPage }>({
          widget: async ({ page }, use) => { await use(new WidgetPage(page)); },
        });
        export { expect } from '@playwright/test';
      `,
      'e2e/specs/widget.spec.ts': `
        import { test } from '../fixtures';
        test('uses widget', async ({ widget }) => {
          await widget.goto();
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const widgets = suite.pageObjects.filter((p) => p.className === 'WidgetPage');
    expect(widgets).toHaveLength(2);
    expect(widgets.map((w) => w.urls[0]).sort()).toEqual(['/one', '/two']);

    // the fixture wires 'widget' to the ONE variant specifically; the spec's merged
    // facts must reflect that file, not the other same-named class.
    expect(suite.fixtureKeys.widget).toBe('WidgetPage');
    expect(suite.specs[0].urls).toEqual(['/one']);
  });
});

describe('suite-facts: ambiguous same-named page object still propagates unresolved (deferred-minor promoted)', () => {
  it('ORs in unresolved from an ambiguous match instead of silently reporting resolved: false', () => {
    const dir = makeRepo({
      'e2e/pages/one/WidgetPage.ts': `
        import type { Page } from '@playwright/test';
        export class WidgetPage {
          constructor(readonly page: Page) {}
          async goto(id: string) { await this.page.goto(\`/one/\${id}\`); }
        }
      `,
      'e2e/pages/two/WidgetPage.ts': `
        import type { Page } from '@playwright/test';
        export class WidgetPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/two'); }
        }
      `,
      // A barrel re-exporting one of the two same-named classes. The spec below imports
      // WidgetPage from THIS file, which `resolveRelative` resolves to the barrel itself —
      // neither of the two `${file}::WidgetPage` keys — so `resolvePageObject` can't pin down
      // an exact file and falls back to a name-only match, which is ambiguous (two candidates).
      'e2e/pages/index.ts': `
        export { WidgetPage } from './one/WidgetPage';
      `,
      'e2e/specs/widget.spec.ts': `
        import { test } from '@playwright/test';
        import { WidgetPage } from '../pages/index';
        test('uses widget', async ({ page }) => {
          const widget = new WidgetPage(page);
          await widget.goto('42');
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const widgets = suite.pageObjects.filter((p) => p.className === 'WidgetPage');
    expect(widgets).toHaveLength(2);
    // One of the two (the /one variant, via its template-literal goto) is itself unresolved.
    expect(widgets.some((w) => w.unresolved)).toBe(true);

    // The false-negative this fix closes: before it, an ambiguous match returned `undefined`
    // and the spec's `unresolved` flag never saw the underlying classes' unresolved-ness at
    // all, wrongly reporting `unresolved: false` and excluding this test from regression scope.
    expect(suite.specs[0].unresolved).toBe(true);
  });
});

describe('suite-facts: fixture-module detection prefers non-spec files (defect C)', () => {
  it('does not mistake a spec-local test.extend for the suite fixture module', () => {
    const dir = makeRepo({
      // sorts BEFORE fixtures.ts in git ls-tree order ('a' < 'f'), so a naive
      // first-match-in-listing-order scan would pick this one instead.
      'e2e/specs/account.spec.ts': `
        import { test as base } from '@playwright/test';
        const test = base.extend<{ local: number }>({
          local: async ({}, use) => { await use(1); },
        });
        test('uses a spec-local fixture', async ({ local }) => {});
      `,
      'e2e/specs/fixtures.ts': `
        import { test as base } from '@playwright/test';
        import { CartPage } from '../pages/CartPage';
        export const test = base.extend<{ cart: CartPage }>({
          cart: async ({ page }, use) => { await use(new CartPage(page)); },
        });
        export { expect } from '@playwright/test';
      `,
      'e2e/pages/CartPage.ts': `
        import type { Page } from '@playwright/test';
        export class CartPage {
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/cart'); }
        }
      `,
      'e2e/specs/cart.spec.ts': `
        import { test } from './fixtures';
        test('uses cart', async ({ cart }) => { await cart.goto(); });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.fixtureFile).toBe('e2e/specs/fixtures.ts');
    expect(suite.fixtureKeys).toEqual({ cart: 'CartPage' });
  });
});

describe('suite-facts: setupPattern does not cross file boundaries (defect D)', () => {
  it('does not treat a login() at the start of one file as satisfying a beforeEach at the end of another', () => {
    // Deliberately tight: `beforeEach` sits at the literal END of file A's text and `login(`
    // at the literal START of file B's, with only the '\n' join between them (a 29-char gap,
    // measured — see the scratch check in the fix-1 report entry) — well inside the regex's
    // 200-char window, so the OLD joined-text scan is guaranteed to false-positive here.
    // Neither file matches the pattern on its own (asserted below), so this genuinely
    // distinguishes the per-file fix from the unfixed joined-text scan.
    const fileA = `import { test } from '@playwright/test';\ntest('placeholder', async () => {});\ntest.beforeEach(async () => {});\n`;
    const fileB = `login('a@b.com');\ntest('placeholder2', async () => {});\n`;
    const proximity = /beforeEach[\s\S]{0,200}(login|signIn)\w*\(/;
    expect(proximity.test(fileA)).toBe(false);
    expect(proximity.test(fileB)).toBe(false);
    expect(proximity.test(fileA + '\n' + fileB)).toBe(true); // the false positive the old joined scan would hit

    const dir = makeRepo({
      'e2e/specs/a.spec.ts': fileA,
      'e2e/specs/b.spec.ts': fileB,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.setupPattern).toBe('none');
  });

  it('still detects a genuine same-file beforeEach → login as beforeEach', () => {
    const dir = makeRepo({
      'e2e/specs/a.spec.ts': `
        import { test } from '@playwright/test';
        test.beforeEach(async ({ page }) => {
          await login(page, 'user@example.com');
        });
        test('does something', async ({ page }) => {});
        async function login(page: any, email: string) {}
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.setupPattern).toBe('beforeEach');
  });
});

describe('suite-facts: describe modifier chains (defect E)', () => {
  it('captures titles under test.describe.serial/parallel/only/skip', () => {
    const dir = makeRepo({
      'e2e/specs/modifiers.spec.ts': `
        import { test } from '@playwright/test';
        test.describe.serial('Serial group', () => {
          test('a', async () => {});
        });
        test.describe.parallel('Parallel group', () => {
          test('b', async () => {});
        });
        test.describe.only('Only group', () => {
          test('c', async () => {});
        });
        test.describe.skip('Skip group', () => {
          test('d', async () => {});
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.specs[0].tests).toEqual([
      'Serial group › a',
      'Parallel group › b',
      'Only group › c',
      'Skip group › d',
    ]);
    expect(suite.totalTests).toBe(4);
  });
});

describe('suite-facts: unresolved propagates through both page-object obtain paths (fix 1)', () => {
  const ITEM_PAGE = `
    import type { Page } from '@playwright/test';
    export class ItemPage {
      constructor(readonly page: Page) {}
      async goto(id: string) { await this.page.goto(\`/item/\${id}\`); }
    }
  `;

  it('marks a spec unresolved when it obtains the page object via test.extend destructuring', () => {
    const dir = makeRepo({
      'e2e/pages/ItemPage.ts': ITEM_PAGE,
      'e2e/fixtures.ts': `
        import { test as base } from '@playwright/test';
        import { ItemPage } from './pages/ItemPage';
        export const test = base.extend<{ item: ItemPage }>({
          item: async ({ page }, use) => { await use(new ItemPage(page)); },
        });
        export { expect } from '@playwright/test';
      `,
      'e2e/specs/item.spec.ts': `
        import { test } from '../fixtures';
        test('views an item', async ({ item }) => {
          await item.goto('42');
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const spec = suite.specs[0];
    // the page object's own facts must carry the flag too, not just the spec
    const itemPage = suite.pageObjects.find((p) => p.className === 'ItemPage')!;
    expect(itemPage.unresolved).toBe(true);
    expect(spec.unresolved).toBe(true);
  });

  it('marks a spec unresolved when it obtains the page object via direct construction', () => {
    const dir = makeRepo({
      'e2e/pages/ItemPage.ts': ITEM_PAGE,
      'e2e/specs/item.spec.ts': `
        import { test } from '@playwright/test';
        import { ItemPage } from '../pages/ItemPage';
        test('views an item', async ({ page }) => {
          const item = new ItemPage(page);
          await item.goto('42');
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.specs[0].unresolved).toBe(true);
  });

  it('marks a spec unresolved for its own direct template-literal page.goto', () => {
    const dir = makeRepo({
      'e2e/specs/item.spec.ts': `
        import { test } from '@playwright/test';
        test('views an item', async ({ page }) => {
          await page.goto(\`/item/\${'42'}\`);
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.specs[0].unresolved).toBe(true);
  });
});

describe('suite-facts: unresolved propagates through page-object-to-page-object delegation (fix 2)', () => {
  it('marks the delegating OuterPage (and its spec) unresolved when the InnerPage it delegates to navigates non-literally', () => {
    const dir = makeRepo({
      'e2e/pages/InnerPage.ts': `
        import type { Page } from '@playwright/test';
        export class InnerPage {
          constructor(readonly page: Page) {}
          async goto(id: string) { await this.page.goto(\`/inner/\${id}\`); }
        }
      `,
      'e2e/pages/OuterPage.ts': `
        import type { Page } from '@playwright/test';
        import { InnerPage } from './InnerPage';
        export class OuterPage {
          readonly inner: InnerPage;
          constructor(readonly page: Page) { this.inner = new InnerPage(page); }
          async goto(id: string) { await this.inner.goto(id); }
        }
      `,
      'e2e/fixtures.ts': `
        import { test as base } from '@playwright/test';
        import { OuterPage } from './pages/OuterPage';
        export const test = base.extend<{ outer: OuterPage }>({
          outer: async ({ page }, use) => { await use(new OuterPage(page)); },
        });
        export { expect } from '@playwright/test';
      `,
      'e2e/specs/outer.spec.ts': `
        import { test } from '../fixtures';
        test('uses only OuterPage', async ({ outer }) => {
          await outer.goto('42');
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const outer = suite.pageObjects.find((p) => p.className === 'OuterPage')!;
    const inner = suite.pageObjects.find((p) => p.className === 'InnerPage')!;
    expect(inner.unresolved).toBe(true);
    expect(outer.unresolved).toBe(true);
    expect(suite.specs[0].unresolved).toBe(true);
  });

  it('propagates through a three-level chain (A -> B -> C, only C non-literal)', () => {
    const dir = makeRepo({
      'e2e/pages/CPage.ts': `
        import type { Page } from '@playwright/test';
        export class CPage {
          constructor(readonly page: Page) {}
          async goto(id: string) { await this.page.goto(\`/c/\${id}\`); }
        }
      `,
      'e2e/pages/BPage.ts': `
        import type { Page } from '@playwright/test';
        import { CPage } from './CPage';
        export class BPage {
          readonly c: CPage;
          constructor(readonly page: Page) { this.c = new CPage(page); }
          async goto(id: string) { await this.c.goto(id); }
        }
      `,
      'e2e/pages/APage.ts': `
        import type { Page } from '@playwright/test';
        import { BPage } from './BPage';
        export class APage {
          readonly b: BPage;
          constructor(readonly page: Page) { this.b = new BPage(page); }
          async goto(id: string) { await this.b.goto(id); }
        }
      `,
      'e2e/specs/chain.spec.ts': `
        import { test } from '@playwright/test';
        import { APage } from '../pages/APage';
        test('uses only APage', async ({ page }) => {
          const a = new APage(page);
          await a.goto('7');
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const a = suite.pageObjects.find((p) => p.className === 'APage')!;
    const b = suite.pageObjects.find((p) => p.className === 'BPage')!;
    const c = suite.pageObjects.find((p) => p.className === 'CPage')!;
    expect(c.unresolved).toBe(true);
    expect(b.unresolved).toBe(true);
    expect(a.unresolved).toBe(true);
  });

  it('does not spuriously mark, or infinite-loop on, two page objects that import each other but never navigate non-literally', () => {
    const dir = makeRepo({
      'e2e/pages/MutualA.ts': `
        import type { Page } from '@playwright/test';
        import type { MutualB } from './MutualB';
        export class MutualA {
          partner?: MutualB;
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/mutual-a'); }
        }
      `,
      'e2e/pages/MutualB.ts': `
        import type { Page } from '@playwright/test';
        import type { MutualA } from './MutualA';
        export class MutualB {
          partner?: MutualA;
          constructor(readonly page: Page) {}
          async goto() { await this.page.goto('/mutual-b'); }
        }
      `,
      'e2e/specs/mutual.spec.ts': `
        import { test } from '@playwright/test';
        import { MutualA } from '../pages/MutualA';
        test('uses MutualA', async ({ page }) => {
          const a = new MutualA(page);
          await a.goto();
        });
      `,
    });

    const suite = extractSuite(dir, 'main', 'e2e');
    const a = suite.pageObjects.find((p) => p.className === 'MutualA')!;
    const b = suite.pageObjects.find((p) => p.className === 'MutualB')!;
    expect(a.unresolved).toBe(false);
    expect(b.unresolved).toBe(false);
    expect(suite.specs[0].unresolved).toBe(false);
  });
});

describe('suite-facts: I4 — a pathological spec file does not poison the whole suite', () => {
  it('records an unparseable spec as unparsed and still extracts the rest of the suite', () => {
    const term = Array.from({ length: 5000 }, (_, i) => `x${i}`).join(' || ');
    const dir = makeRepo({
      'e2e/specs/bad.spec.ts': `export const bad = ${term};\n`,
      'e2e/specs/ok.spec.ts': `
        import { test } from '@playwright/test';
        test('does something', async ({ page }) => { await page.goto('/x'); });
      `,
    });
    const suite = extractSuite(dir, 'main', 'e2e');
    expect(suite.unparsed).toEqual(['e2e/specs/bad.spec.ts']);
    expect(suite.specs.map((s) => s.path)).toEqual(['e2e/specs/ok.spec.ts']);
    expect(suite.totalTests).toBe(1);
  });
});
