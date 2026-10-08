import { products, type Cart } from '../store';

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => {
    const price = products.find((p) => p.id === item.productId)?.price ?? 0;
    return sum + price * item.qty;
  }, 0);
}

export function total(cart: Cart): number {
  return subtotal(cart);
}
