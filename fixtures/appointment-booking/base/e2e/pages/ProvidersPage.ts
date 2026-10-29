import type { Locator, Page } from '@playwright/test';

export class ProvidersPage {
  readonly searchInput: Locator;
  readonly count: Locator;
  readonly empty: Locator;
  readonly cards: Locator;

  constructor(readonly page: Page) {
    this.searchInput = page.getByTestId('provider-search-input');
    this.count = page.getByTestId('provider-count');
    this.empty = page.getByTestId('no-providers');
    this.cards = page.getByTestId('provider-list').locator('li');
  }

  async goto() {
    await this.page.goto('/providers');
  }

  async search(q: string) {
    await this.searchInput.fill(q);
    await this.page.getByTestId('provider-search-submit').click();
  }

  provider(id: string): Locator {
    return this.page.getByTestId(`provider-${id}`);
  }

  names(): Locator {
    return this.page.getByTestId('provider-name');
  }

  async book(id: string) {
    await this.page.getByTestId(`book-${id}`).click();
  }
}
