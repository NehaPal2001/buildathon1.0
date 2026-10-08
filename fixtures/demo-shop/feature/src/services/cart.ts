import { products, type Cart } from '../store';
import { appliedCoupons, findCoupon } from './coupon';

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => {
    const price = products.find((p) => p.id === item.productId)?.price ?? 0;
    return sum + price * item.qty;
  }, 0);
}

function cheapestLine(cart: Cart): number {
  const prices = cart.items.map((i) => products.find((p) => p.id === i.productId)?.price ?? 0);
  return prices.length ? Math.min(...prices) : 0;
}

export function discount(cart: Cart): number {
  const sub = subtotal(cart);
  let off = 0;
  for (const code of appliedCoupons(cart)) {
    const coupon = findCoupon(code);
    if (!coupon) continue;
    switch (coupon.type) {
      case 'PERCENT':
        off += Math.round((sub * coupon.value) / 100);
        break;
      case 'FLAT':
        off += coupon.value;
        break;
      case 'BOGO':
        off += cheapestLine(cart);
        break;
    }
  }
  return Math.min(off, sub);
}

export function total(cart: Cart): number {
  return subtotal(cart) - discount(cart);
}
