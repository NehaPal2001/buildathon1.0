import { Router } from 'express';
import { products, type Product } from '../store';
import { layout } from '../views/layout';

export const searchRouter = Router();

function find(q: string): Product[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return products.filter((p) => p.name.toLowerCase().includes(needle) || p.category === needle);
}

searchRouter.get('/search', (req, res) => {
  const q = String(req.query.q ?? '');
  const hits = find(q);
  const empty = q.trim() && hits.length === 0 ? '<p data-testid="no-results">No products match.</p>' : '';
  const list = hits.map((p) => `<li data-testid="result-${p.id}">${p.name}</li>`).join('');
  res.send(
    layout(
      'Search',
      `<h1>Search</h1>
<form method="get" action="/search">
  <label>Search products <input name="q" value="${q.replace(/"/g, '&quot;')}" data-testid="search-input"></label>
  <button type="submit" data-testid="search-submit">Search</button>
</form>
${empty}
<ul data-testid="search-results">${list}</ul>`,
    ),
  );
});

searchRouter.get('/api/search', (req, res) => {
  res.json(find(String(req.query.q ?? '')));
});
