import { test, expect } from '../fixtures';

test.describe('Account', () => {
  test.beforeEach(async ({ account }) => {
    await account.goto();
  });

  test('starts with an empty profile', async ({ account }) => {
    await expect(account.name).toHaveValue('');
    await expect(account.phone).toHaveValue('');
  });

  test('saving shows a confirmation', async ({ account }) => {
    await account.saveProfile({ name: 'Priya Nair', phone: '9876543210', email: 'priya@example.com' });
    await expect(account.saved).toBeVisible();
    await expect(account.email).toHaveValue('priya@example.com');
  });

  test('name is required', async ({ account }) => {
    await account.saveProfile({ name: '   ', phone: '9876543210' });
    await expect(account.error).toHaveText('Name is required.');
  });

  test('saved profile pre-fills the booking form', async ({ account, booking }) => {
    await account.saveProfile({ name: 'Priya Nair', phone: '9876543210' });
    await booking.goto('prov_1');
    await expect(booking.nameInput).toHaveValue('Priya Nair');
    await expect(booking.phoneInput).toHaveValue('9876543210');
  });

  test('profile API reflects the saved values', async ({ account, page }) => {
    await account.saveProfile({ name: 'Priya Nair', phone: '123' });
    const body = await (await page.request.get('/api/account')).json();
    expect(body).toEqual({ name: 'Priya Nair', phone: '123', email: '' });
  });
});
