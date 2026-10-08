import { describe, it, expect } from 'vitest';
import { codeLikeTokens } from '../lib/prose';

const banned = new Set(['applyCoupon', 'CouponError', 'rawCode', 'coupon', 'cart', 'subtotal', 'MIN_CART', 'res', 'status']);

describe('codeLikeTokens', () => {
  it('lets plain words through even when they are identifiers', () => {
    expect(codeLikeTokens('Applying a coupon to a cart below the minimum', banned)).toEqual([]);
  });
  it('flags camelCase, PascalCase and CONSTANT_CASE identifiers from the code', () => {
    expect(codeLikeTokens('applyCoupon rejects it; CouponError is thrown; MIN_CART applies', banned)).toEqual(['applyCoupon', 'CouponError', 'MIN_CART']);
  });
  it('flags call syntax and dotted member access', () => {
    expect(codeLikeTokens('calls res.status(422) then returns', banned)).toEqual(['res.status', 'status(']);
  });
  it('does not flag literal values a tester needs', () => {
    expect(codeLikeTokens('enter SAVE20 with a cart of ₹499', banned)).toEqual([]);
  });
  it('allows file citations and abbreviations', () => {
    expect(codeLikeTokens('visits /checkout → src/routes/checkout.ts → src/services/coupon.ts (changed), e.g. see api/openapi.yaml:12', banned)).toEqual([]);
    expect(codeLikeTokens('covered by e2e/specs/coupon.spec.ts#Coupons › a percent coupon reduces the total', banned)).toEqual([]);
  });
});
