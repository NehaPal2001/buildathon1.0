import { test, expect } from '../fixtures';
import { goToSection, sections, type Section } from '../helpers/nav';

test.describe('Smoke', () => {
  test('every section loads with a heading', async ({ page }) => {
    for (const section of Object.keys(sections) as Section[]) {
      await goToSection(page, section);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('home shows the shop name', async ({ page }) => {
    await goToSection(page, 'home');
    await expect(page.getByTestId('nav-home')).toHaveText('Demo Shop');
  });

  test('header is present on every section', async ({ page }) => {
    for (const section of Object.keys(sections) as Section[]) {
      await goToSection(page, section);
      await expect(page.getByTestId('header')).toBeVisible();
    }
  });
});
