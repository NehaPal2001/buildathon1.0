import { test, expect } from '../fixtures';

test.describe('Providers and search', () => {
  test.beforeEach(async ({ providers }) => {
    await providers.goto();
  });

  test('lists all five providers', async ({ providers }) => {
    await expect(providers.cards).toHaveCount(5);
    await expect(providers.count).toHaveText('5 providers found');
  });

  test('search by name', async ({ providers }) => {
    await providers.search('asha');
    await expect(providers.names()).toHaveText(['Dr. Asha Rao']);
  });

  test('search by specialty', async ({ providers }) => {
    await providers.search('general');
    await expect(providers.cards).toHaveCount(2);
  });

  test('search is case-insensitive', async ({ providers }) => {
    await providers.search('DERMATOLOGY');
    await expect(providers.provider('prov_3')).toBeVisible();
  });

  test('shows an empty state when nothing matches', async ({ providers }) => {
    await providers.search('zzz');
    await expect(providers.empty).toContainText('zzz');
    await expect(providers.count).toHaveText('0 providers found');
  });

  test('book button opens booking for that provider', async ({ page, providers, booking }) => {
    await providers.book('prov_2');
    await expect(page).toHaveURL(/providerId=prov_2/);
    await expect(booking.chosenProvider).toHaveText('Dr. Vikram Shah');
  });
});
