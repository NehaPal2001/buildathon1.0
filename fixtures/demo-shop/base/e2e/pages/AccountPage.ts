import type { Locator, Page } from '@playwright/test';

export class AccountPage {
  readonly signedInAs: Locator;
  readonly loginError: Locator;
  readonly loginForm: Locator;

  constructor(readonly page: Page) {
    this.signedInAs = page.getByTestId('signed-in-as');
    this.loginError = page.getByTestId('login-error');
    this.loginForm = page.getByTestId('login');
  }

  async goto() {
    await this.page.goto('/account');
  }

  async login(email: string, password: string) {
    await this.page.getByTestId('email').fill(email);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Sign out' }).click();
  }
}
