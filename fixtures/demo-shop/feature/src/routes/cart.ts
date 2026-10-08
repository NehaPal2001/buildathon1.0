import { Router } from 'express';
import { getOrCreateCart, products } from '../store';
import { subtotal } from '../services/cart';
import { applyCoupon, CouponError } from '../services/coupon';
import { layout } from '../views/layout';
import { respond } from '../respond';
import { inr } from '../money';

export const cartRouter = Router();

cartRouter.get('/cart', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  const rows = cart.items
    .map((item) => {
      const p = products.find((x) => x.id === item.productId)!;
      return `
    <li data-testid="cart-item-${p.id}">
      <span data-testid="item-name">${p.name}</span> ×
      <span data-testid="item-qty">${item.qty}</span>
      <span data-testid="item-line">${inr(p.price * item.qty)}</span>
      <form method="post" action="/api/cart/items/${p.id}/remove"><button type="submit" data-testid="remove-${p.id}">Remove</button></form>
    </li>`;
    })
    .join('');
  const empty = cart.items.length ? '' : '<p data-testid="cart-empty">Your cart is empty.</p>';
  res.send(
    layout(
      'Cart',
      `<h1>Cart</h1>
${empty}
<ul data-testid="cart-items">${rows}</ul>
<p>Subtotal <span data-testid="cart-subtotal">${inr(subtotal(cart))}</span></p>
<a href="/checkout" data-testid="go-to-checkout">Checkout</a>`,
    ),
  );
});

cartRouter.get('/api/cart', (req, res) => {
  res.json(getOrCreateCart(req.sid));
});

cartRouter.post('/api/cart/items', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  const productId = String(req.body.productId ?? '');
  const qty = Math.max(1, Number(req.body.qty ?? 1) || 1);
  if (!products.some((p) => p.id === productId)) {
    respond(req, res, '/cart', { error: 'UNKNOWN_PRODUCT' }, 404);
    return;
  }
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) existing.qty += qty;
  else cart.items.push({ productId, qty });
  respond(req, res, '/cart', { cart });
});

cartRouter.post('/api/cart/items/:id/remove', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  cart.items = cart.items.filter((i) => i.productId !== req.params.id);
  respond(req, res, '/cart', { cart });
});

cartRouter.post('/api/cart/coupon', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  const code = String(req.body.code ?? '');
  try {
    const coupons = applyCoupon(cart, code, subtotal(cart));
    respond(req, res, '/checkout', { cart, coupons });
  } catch (err) {
    if (err instanceof CouponError) {
      respond(req, res, `/checkout?error=${err.code}`, { error: err.code }, err.status);
      return;
    }
    throw err;
  }
});
