import type { Locator, Page } from '@playwright/test';

export class AppointmentsPage {
  readonly empty: Locator;
  readonly rows: Locator;
  readonly cancelledBanner: Locator;

  constructor(readonly page: Page) {
    this.empty = page.getByTestId('no-appointments');
    this.rows = page.getByTestId('appointment-list').locator('tbody tr');
    this.cancelledBanner = page.getByTestId('cancelled-banner');
  }

  async goto() {
    await this.page.goto('/appointments');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`appointment-${id}`);
  }

  statusOf(id: string): Locator {
    return this.row(id).getByTestId('appointment-status');
  }

  providerOf(id: string): Locator {
    return this.row(id).getByTestId('appointment-provider');
  }

  cancelButton(id: string): Locator {
    return this.page.getByTestId(`cancel-${id}`);
  }

  async cancel(id: string) {
    await this.cancelButton(id).click();
  }

  async open(id: string) {
    await this.row(id).getByTestId('appointment-link').click();
  }
}
