import type { Locator, Page } from '@playwright/test';

export class AccountPage {
  readonly name: Locator;
  readonly phone: Locator;
  readonly email: Locator;
  readonly save: Locator;
  readonly saved: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.name = page.getByTestId('account-name');
    this.phone = page.getByTestId('account-phone');
    this.email = page.getByTestId('account-email');
    this.save = page.getByTestId('account-save');
    this.saved = page.getByTestId('account-saved');
    this.error = page.getByTestId('account-error');
  }

  async goto() {
    await this.page.goto('/account');
  }

  async saveProfile(p: { name: string; phone?: string; email?: string }) {
    await this.name.fill(p.name);
    await this.phone.fill(p.phone ?? '');
    await this.email.fill(p.email ?? '');
    await this.save.click();
  }
}
