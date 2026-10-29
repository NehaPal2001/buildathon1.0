import { test, expect } from '../fixtures';
import { goToSection, sections, type Section } from '../helpers/nav';

test.describe('Smoke', () => {
  test('every section loads with a heading', async ({ page }) => {
    for (const section of Object.keys(sections) as Section[]) {
      await goToSection(page, section);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('home shows the clinic name', async ({ page }) => {
    await goToSection(page, 'services');
    await expect(page.getByTestId('nav-home')).toHaveText('CareSlot Clinic');
  });

  test('header is present on every section', async ({ page }) => {
    for (const section of Object.keys(sections) as Section[]) {
      await goToSection(page, section);
      await expect(page.getByTestId('header')).toBeVisible();
    }
  });
});
