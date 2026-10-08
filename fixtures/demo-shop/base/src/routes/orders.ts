import { Router } from 'express';
import { orders } from '../store';
import { layout } from '../views/layout';
import { inr } from '../money';

export const ordersRouter = Router();

ordersRouter.get('/orders', (req, res) => {
  const mine = orders.filter((o) => o.cartId === req.sid);
  const placed = req.query.placed ? `<p data-testid="order-placed">Order ${String(req.query.placed)} placed.</p>` : '';
  const none = mine.length ? '' : '<p data-testid="no-orders">No orders yet.</p>';
  const list = mine
    .map((o) => `<li data-testid="order-${o.id}"><span data-testid="order-id">${o.id}</span> <span data-testid="order-total">${inr(o.total)}</span></li>`)
    .join('');
  res.send(layout('Orders', `<h1>Orders</h1>\n${placed}\n${none}\n<ul data-testid="order-list">${list}</ul>`));
});

ordersRouter.get('/api/orders', (req, res) => {
  res.json(orders.filter((o) => o.cartId === req.sid));
});
