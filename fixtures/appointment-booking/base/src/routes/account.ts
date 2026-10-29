import { Router } from 'express';
import { profile } from '../store';
import { layout } from '../views/layout';
import { esc } from '../format';
import { respond, wantsJson } from '../respond';

export const accountRouter = Router();

function page(error = '', saved = false): string {
  return layout(
    'Account',
    `<h1>My account</h1><p class="sub">Your details are used to pre-fill bookings.</p>
${saved ? '<div class="banner ok" role="status" data-testid="account-saved">Profile saved.</div>' : ''}
${error ? `<div class="banner error" role="alert" data-testid="account-error">${esc(error)}</div>` : ''}
<form method="post" action="/api/account" class="card" data-testid="account-form">
  <label for="name">Full name</label>
  <input id="name" name="name" value="${esc(profile.name)}" data-testid="account-name">
  <label for="phone">Phone</label>
  <input id="phone" name="phone" value="${esc(profile.phone)}" inputmode="tel" data-testid="account-phone">
  <label for="email">Email (optional)</label>
  <input id="email" name="email" value="${esc(profile.email)}" data-testid="account-email">
  <button type="submit" data-testid="account-save">Save profile</button>
</form>`,
  );
}

accountRouter.get('/account', (req, res) => {
  res.send(page('', req.query.saved === '1'));
});

accountRouter.get('/api/account', (_req, res) => {
  res.json(profile);
});

accountRouter.post('/api/account', (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) {
    if (wantsJson(req)) {
      res.status(400).json({ error: 'VALIDATION', message: 'Name is required.' });
      return;
    }
    res.status(400).send(page('Name is required.'));
    return;
  }
  profile.name = name;
  profile.phone = String(req.body.phone ?? '').trim();
  profile.email = String(req.body.email ?? '').trim();
  respond(req, res, '/account?saved=1', profile);
});
