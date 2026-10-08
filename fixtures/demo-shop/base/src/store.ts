export interface Product { id: string; name: string; price: number; category: string }
export interface CartItem { productId: string; qty: number }
export interface Cart { id: string; items: CartItem[] }
export interface Order { id: string; cartId: string; total: number; placedAt: string }
export interface User { email: string; password: string; name: string }

export const products: Product[] = [
  { id: 'p1', name: 'Steel water bottle', price: 349, category: 'kitchen' },
  { id: 'p2', name: 'Cotton tote bag', price: 199, category: 'bags' },
  { id: 'p3', name: 'Desk lamp', price: 1299, category: 'home' },
  { id: 'p4', name: 'Ruled notebook', price: 149, category: 'stationery' },
  { id: 'p5', name: 'Wireless mouse', price: 899, category: 'electronics' },
  { id: 'p6', name: 'Ceramic mug', price: 249, category: 'kitchen' },
];

export const users: User[] = [
  { email: 'asha@example.com', password: 'secret1', name: 'Asha' },
];

export const carts = new Map<string, Cart>();
export const orders: Order[] = [];
export const sessions = new Map<string, { email?: string }>();

export function getOrCreateCart(sid: string): Cart {
  let cart = carts.get(sid);
  if (!cart) {
    cart = { id: sid, items: [] };
    carts.set(sid, cart);
  }
  return cart;
}
