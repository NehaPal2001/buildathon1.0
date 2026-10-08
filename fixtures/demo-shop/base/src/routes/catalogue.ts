import { Router } from 'express';
import { products } from '../store';
import { layout } from '../views/layout';
import { inr } from '../money';

export const catalogueRouter = Router();

catalogueRouter.get('/', (_req, res) => {
  const items = products
    .map(
      (p) => `
    <li data-testid="product-${p.id}">
      <span data-testid="product-name">${p.name}</span>
      <span data-testid="product-price">${inr(p.price)}</span>
      <form method="post" action="/api/cart/items">
        <input type="hidden" name="productId" value="${p.id}">
        <button type="submit" data-testid="add-${p.id}">Add to cart</button>
      </form>
    </li>`,
    )
    .join('');
  res.send(layout('Catalogue', `<h1>Catalogue</h1><ul data-testid="product-list">${items}</ul>`));
});

catalogueRouter.get('/api/products', (_req, res) => {
  res.json(products);
});
