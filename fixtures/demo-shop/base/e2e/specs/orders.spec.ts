import { test, expect } from '../fixtures';

test.describe('Orders', () => {
  test.beforeEach(async ({ orders }) => {
    await orders.goto();
  });

  test('shows a message when there are no orders', async ({ orders }) => {
    await expect(orders.noOrders).toBeVisible();
  });

  test('lists no orders for a new visitor', async ({ orders }) => {
    await expect(orders.orders).toHaveCount(0);
  });

  test('page title names orders', async ({ page }) => {
    await expect(page).toHaveTitle(/Orders/);
  });

  test('shows a placed banner when arriving with a placed order id', async ({ page, orders }) => {
    await page.goto('/orders?placed=o42');
    await expect(orders.placedBanner).toHaveText('Order o42 placed.');
  });

  test('orders API returns an empty list for a new session', async ({ page }) => {
    const res = await page.request.get('/api/orders');
    expect(await res.json()).toEqual([]);
  });
});
