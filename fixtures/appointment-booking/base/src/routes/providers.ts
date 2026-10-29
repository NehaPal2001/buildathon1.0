import { Router } from 'express';
import { providers, slots } from '../store';
import { layout } from '../views/layout';
import { esc } from '../format';

export const providersRouter = Router();

function search(q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return providers;
  return providers.filter((p) => p.name.toLowerCase().includes(needle) || p.specialty.toLowerCase().includes(needle));
}

providersRouter.get('/providers', (req, res) => {
  const q = String(req.query.q ?? '');
  const found = search(q);
  const items = found
    .map(
      (p) => `
    <li data-testid="provider-${p.id}">
      <h2 data-testid="provider-name">${p.name}</h2>
      <div class="muted" data-testid="provider-specialty">${p.specialty}</div>
      <a class="btn small" href="/book?providerId=${p.id}" data-testid="book-${p.id}">Book</a>
    </li>`,
    )
    .join('');
  const results = found.length
    ? `<ul class="cards" data-testid="provider-list">${items}</ul>`
    : `<div class="empty" data-testid="no-providers">No providers match “${esc(q)}”.</div>`;
  res.send(
    layout(
      'Providers',
      `<h1>Providers</h1><p class="sub">Search by name or specialty.</p>
<form method="get" action="/providers" class="row" role="search">
  <div><label for="q">Search</label><input id="q" name="q" value="${esc(q)}" placeholder="e.g. dermatology" data-testid="provider-search-input"></div>
  <button type="submit" data-testid="provider-search-submit">Search</button>
</form>
<p class="muted" data-testid="provider-count">${found.length} provider${found.length === 1 ? '' : 's'} found</p>
${results}`,
    ),
  );
});

providersRouter.get('/api/providers', (req, res) => {
  res.json(search(String(req.query.q ?? '')));
});

providersRouter.get('/api/providers/:id/slots', (req, res) => {
  if (!providers.some((p) => p.id === req.params.id)) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(slots.filter((s) => s.providerId === req.params.id && !s.appointmentId));
});
