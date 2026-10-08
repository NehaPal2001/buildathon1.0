import { describe, it, expect } from 'vitest';
import { FIXTURE, FEATURE } from './fixture';
import { extractUi } from '../ui-surface';
import { UiSchema } from '../schema';

describe('ui-surface', () => {
  const ui = extractUi(FIXTURE, FEATURE, 'e2e');

  it('validates', () => {
    expect(() => UiSchema.parse(ui)).not.toThrow();
  });

  it('finds every route with method, full path and file', () => {
    const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`;
    const keys = ui.routes.map(key);
    expect(keys).toEqual(expect.arrayContaining([
      'GET /', 'GET /api/products', 'GET /search', 'GET /api/search',
      'GET /account', 'POST /api/account/login', 'POST /api/account/logout',
      'GET /cart', 'GET /api/cart', 'POST /api/cart/items', 'POST /api/cart/items/:id/remove', 'POST /api/cart/coupon',
      'GET /checkout', 'POST /api/checkout', 'GET /orders', 'GET /api/orders',
    ]));
    expect(ui.routes.find((r) => key(r) === 'POST /api/cart/coupon')!.file).toBe('src/routes/cart.ts');
  });

  it('computes reach through imports', () => {
    const coupon = ui.routes.find((r) => r.path === '/api/cart/coupon')!;
    expect(coupon.reach).toEqual(expect.arrayContaining(['src/routes/cart.ts', 'src/services/cart.ts', 'src/services/coupon.ts', 'src/store.ts']));
    const products = ui.routes.find((r) => r.path === '/api/products')!;
    expect(products.reach).not.toContain('src/services/coupon.ts');
  });

  it('extracts form elements with their enclosing form action', () => {
    const applyBtn = ui.surface.find((e) => e.element === 'button' && e.attrs['data-testid'] === 'apply-coupon')!;
    expect(applyBtn.form).toEqual({ method: 'post', action: '/api/cart/coupon' });
    expect(applyBtn.file).toBe('src/routes/checkout.ts');
    const couponInput = ui.surface.find((e) => e.element === 'input' && e.attrs.name === 'code')!;
    expect(couponInput.attrs['data-testid']).toBe('coupon-input');
  });

  it('keeps template placeholders in attribute values', () => {
    const add = ui.surface.find((e) => e.element === 'button' && e.attrs['data-testid']?.startsWith('add-'))!;
    expect(add.attrs['data-testid']).toBe('add-${p.id}');
    expect(add.form?.action).toBe('/api/cart/items');
  });

  it('has no BOGO anywhere on the surface', () => {
    expect(ui.surface.length).toBeGreaterThan(0);
    expect(ui.surface.some((e) => e.attrs['data-testid'] === 'coupon-input')).toBe(true);
    expect(JSON.stringify(ui.surface)).not.toContain('BOGO');
  });
});
