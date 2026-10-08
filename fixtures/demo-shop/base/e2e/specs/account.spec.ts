import { test, expect } from '../fixtures';

test.describe('Account', () => {
  test.beforeEach(async ({ account }) => {
    await account.goto();
  });

  test('shows the sign-in form to a new visitor', async ({ account }) => {
    await expect(account.loginForm).toBeVisible();
  });

  test('signs in with the right password', async ({ account }) => {
    await account.login('asha@example.com', 'secret1');
    await expect(account.signedInAs).toHaveText('Signed in as Asha');
  });

  test('rejects a wrong password', async ({ account }) => {
    await account.login('asha@example.com', 'nope');
    await expect(account.loginError).toBeVisible();
  });

  test('rejects an unknown email', async ({ account }) => {
    await account.login('nobody@example.com', 'secret1');
    await expect(account.loginError).toBeVisible();
  });

  test('signing out returns to the sign-in form', async ({ account }) => {
    await account.login('asha@example.com', 'secret1');
    await account.logout();
    await expect(account.loginForm).toBeVisible();
  });

  test('login API returns 401 for bad credentials', async ({ page }) => {
    const res = await page.request.post('/api/account/login', { data: { email: 'asha@example.com', password: 'bad' } });
    expect(res.status()).toBe(401);
  });
});
