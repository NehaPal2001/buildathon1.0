import type { Locator, Page } from '@playwright/test';

export class ServicesPage {
  readonly list: Locator;
  readonly findProvider: Locator;

  constructor(readonly page: Page) {
    this.list = page.getByTestId('service-list');
    this.findProvider = page.getByTestId('browse-providers');
  }

  async goto() {
    await this.page.goto('/');
  }

  service(id: string): Locator {
    return this.page.getByTestId(`service-${id}`);
  }

  names(): Locator {
    return this.list.getByTestId('service-name');
  }

  priceOf(id: string): Locator {
    return this.service(id).getByTestId('service-price');
  }

  durationOf(id: string): Locator {
    return this.service(id).getByTestId('service-duration');
  }
}
