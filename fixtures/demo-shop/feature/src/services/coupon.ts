import type { Cart } from '../store';

export type DiscountType = 'PERCENT' | 'FLAT' | 'BOGO';

export interface Coupon {
  code: string;
  type: DiscountType;
  value: number;
  minCart?: number;
  expiresOn?: string; // YYYY-MM-DD
}

export const coupons: Coupon[] = [
  { code: 'SAVE20', type: 'PERCENT', value: 20, minCart: 500 },
  { code: 'FLAT100', type: 'FLAT', value: 100 },
  { code: 'OLD2025', type: 'PERCENT', value: 10, expiresOn: '2025-12-31' },
];

export class CouponError extends Error {
  constructor(readonly code: 'INVALID_CODE' | 'EXPIRED', readonly status: number) {
    super(code);
  }
}

const applied = new Map<string, string[]>();

export function appliedCoupons(cart: Cart): string[] {
  return applied.get(cart.id) ?? [];
}

export function findCoupon(code: string): Coupon | undefined {
  return coupons.find((c) => c.code === code);
}

/** `cartSubtotal` is passed in so this module does not import the cart service (which imports this one). */
export function applyCoupon(cart: Cart, rawCode: string, cartSubtotal: number): string[] {
  const code = rawCode.toUpperCase();
  const coupon = findCoupon(code);
  if (!coupon) {
    throw new CouponError('INVALID_CODE', 400);
  }
  if (coupon.expiresOn && coupon.expiresOn < new Date().toISOString().slice(0, 10)) {
    throw new CouponError('EXPIRED', 400);
  }
  if (coupon.minCart && cartSubtotal < coupon.minCart) {
    throw new Error('cart below minimum');
  }
  const list = appliedCoupons(cart);
  list.push(coupon.code);
  applied.set(cart.id, list);
  return list;
}

export function clearCoupons(cart: Cart): void {
  applied.delete(cart.id);
}
