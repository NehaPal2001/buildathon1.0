import { test, expect } from '../fixtures';

test.describe('Catalogue', () => {
  test.beforeEach(async ({ catalogue }) => {
    await catalogue.goto();
  });

  test('lists every product', async ({ catalogue }) => {
    await expect(catalogue.productNames()).toHaveCount(6);
  });

  test('shows a price for each product', async ({ catalogue }) => {
    await expect(catalogue.productPrices()).toHaveCount(6);
    await expect(catalogue.productPrices().first()).toHaveText(/^₹\d+$/);
  });

  test('shows the water bottle at its listed price', async ({ catalogue }) => {
    await expect(catalogue.product('p1').getByTestId('product-price')).toHaveText('₹349');
  });

  test('each product has an add-to-cart button', async ({ catalogue }) => {
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
      await expect(catalogue.addButton(id)).toBeVisible();
    }
  });

  test('page title names the catalogue', async ({ page }) => {
    await expect(page).toHaveTitle(/Catalogue/);
  });

  test('header links to every section', async ({ page }) => {
    for (const name of ['Search', 'Cart', 'Checkout', 'Orders', 'Account']) {
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
  });

  test('products API returns the same six products', async ({ page }) => {
    const res = await page.request.get('/api/products');
    expect(res.ok()).toBe(true);
    expect(await res.json()).toHaveLength(6);
  });
});
