import type { Locator, Page } from '@playwright/test';

export class SearchPage {
  readonly input: Locator;
  readonly results: Locator;
  readonly noResults: Locator;

  constructor(readonly page: Page) {
    this.input = page.getByTestId('search-input');
    this.results = page.getByTestId('search-results').locator('li');
    this.noResults = page.getByTestId('no-results');
  }

  async goto() {
    await this.page.goto('/search');
  }

  async search(term: string) {
    await this.input.fill(term);
    await this.page.getByRole('button', { name: 'Search' }).click();
  }

  result(id: string): Locator {
    return this.page.getByTestId(`result-${id}`);
  }
}
