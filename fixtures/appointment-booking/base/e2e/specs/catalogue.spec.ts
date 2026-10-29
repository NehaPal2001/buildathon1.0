import { test, expect } from '../fixtures';

test.describe('Services catalogue', () => {
  test.beforeEach(async ({ services }) => {
    await services.goto();
  });

  test('lists the four services', async ({ services }) => {
    await expect(services.names()).toHaveText([
      'General consultation',
      'Dental check-up',
      'Skin consultation',
      'Eye examination',
    ]);
  });

  test('shows the price in rupees', async ({ services }) => {
    await expect(services.priceOf('svc_general')).toHaveText('₹500');
    await expect(services.priceOf('svc_dental')).toHaveText('₹800');
  });

  test('shows the duration', async ({ services }) => {
    await expect(services.durationOf('svc_eye')).toHaveText('20 min');
  });

  test('page title names services', async ({ page }) => {
    await expect(page).toHaveTitle(/Services/);
  });

  test('find a provider link goes to providers', async ({ page, services }) => {
    await services.findProvider.click();
    await expect(page).toHaveURL(/\/providers$/);
  });
});
