import { Router } from 'express';
import { getOrCreateCart, orders } from '../store';
import { subtotal, total } from '../services/cart';
import { layout } from '../views/layout';
import { respond } from '../respond';
import { inr } from '../money';

export const checkoutRouter = Router();

const errorText: Record<string, string> = {
  ADDRESS_REQUIRED: 'Name and address are required.',
  CART_EMPTY: 'Your cart is empty.',
};

checkoutRouter.get('/checkout', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  const empty = cart.items.length ? '' : '<p data-testid="checkout-empty">Nothing to check out.</p>';
  const err = errorText[String(req.query.error ?? '')];
  const error = err ? `<p data-testid="checkout-error">${err}</p>` : '';
  res.send(
    layout(
      'Checkout',
      `<h1>Checkout</h1>
${empty}
${error}
<p>Subtotal <span data-testid="subtotal">${inr(subtotal(cart))}</span></p>
<p>Total <span data-testid="total">${inr(total(cart))}</span></p>
<form method="post" action="/api/checkout">
  <label>Name <input name="name" data-testid="ship-name"></label>
  <label>Address <input name="address" data-testid="ship-address"></label>
  <button type="submit" data-testid="place-order" ${cart.items.length ? '' : 'disabled'}>Place order</button>
</form>`,
    ),
  );
});

checkoutRouter.post('/api/checkout', (req, res) => {
  const cart = getOrCreateCart(req.sid);
  if (cart.items.length === 0) {
    respond(req, res, '/checkout?error=CART_EMPTY', { error: 'CART_EMPTY' }, 400);
    return;
  }
  const name = String(req.body.name ?? '').trim();
  const address = String(req.body.address ?? '').trim();
  if (!name || !address) {
    respond(req, res, '/checkout?error=ADDRESS_REQUIRED', { error: 'ADDRESS_REQUIRED' }, 400);
    return;
  }
  const order = { id: `o${orders.length + 1}`, cartId: cart.id, total: total(cart), placedAt: new Date().toISOString() };
  orders.push(order);
  cart.items = [];
  respond(req, res, `/orders?placed=${order.id}`, { order }, 201);
});
