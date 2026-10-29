import { Router } from 'express';
import { services } from '../store';
import { layout } from '../views/layout';
import { inr } from '../money';

export const servicesRouter = Router();

servicesRouter.get('/', (_req, res) => {
  const items = services
    .map(
      (s) => `
    <li data-testid="service-${s.id}">
      <h2 data-testid="service-name">${s.name}</h2>
      <div class="muted" data-testid="service-duration">${s.durationMin} min</div>
      <div class="price" data-testid="service-price">${inr(s.priceInr)}</div>
    </li>`,
    )
    .join('');
  res.send(
    layout(
      'Services',
      `<h1>Our services</h1><p class="sub">Pick a service, then find a provider and a time that suits you.</p>
<ul class="cards" data-testid="service-list">${items}</ul>
<a class="btn" href="/providers" data-testid="browse-providers">Find a provider</a>`,
    ),
  );
});

servicesRouter.get('/api/services', (_req, res) => {
  res.json(services);
});
