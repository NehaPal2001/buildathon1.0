import { Router } from 'express';
import { sessions, users } from '../store';
import { layout } from '../views/layout';
import { respond } from '../respond';

export const accountRouter = Router();

accountRouter.get('/account', (req, res) => {
  const current = sessions.get(req.sid);
  if (current?.email) {
    const user = users.find((u) => u.email === current.email);
    res.send(
      layout(
        'Account',
        `<h1>Account</h1>
<p data-testid="signed-in-as">Signed in as ${user?.name ?? current.email}</p>
<form method="post" action="/api/account/logout"><button type="submit" data-testid="logout">Sign out</button></form>`,
      ),
    );
    return;
  }
  const error = req.query.error === 'BAD_CREDENTIALS' ? '<p data-testid="login-error">Email or password is wrong.</p>' : '';
  res.send(
    layout(
      'Sign in',
      `<h1>Sign in</h1>
${error}
<form method="post" action="/api/account/login">
  <label>Email <input name="email" data-testid="email"></label>
  <label>Password <input type="password" name="password" data-testid="password"></label>
  <button type="submit" data-testid="login">Sign in</button>
</form>`,
    ),
  );
});

accountRouter.post('/api/account/login', (req, res) => {
  const email = String(req.body.email ?? '');
  const password = String(req.body.password ?? '');
  const user = users.find((u) => u.email === email && u.password === password);
  if (!user) {
    respond(req, res, '/account?error=BAD_CREDENTIALS', { error: 'BAD_CREDENTIALS' }, 401);
    return;
  }
  sessions.set(req.sid, { email: user.email });
  respond(req, res, '/account', { ok: true, name: user.name });
});

accountRouter.post('/api/account/logout', (req, res) => {
  sessions.delete(req.sid);
  respond(req, res, '/account', { ok: true });
});
