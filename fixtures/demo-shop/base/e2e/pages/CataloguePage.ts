import type { Locator, Page } from '@playwright/test';

export class CataloguePage {
  readonly productList: Locator;

  constructor(readonly page: Page) {
    this.productList = page.getByTestId('product-list');
  }

  async goto() {
    await this.page.goto('/');
  }

  product(id: string): Locator {
    return this.page.getByTestId(`product-${id}`);
  }

  addButton(id: string): Locator {
    return this.page.getByTestId(`add-${id}`);
  }

  async addToCart(id: string) {
    await this.addButton(id).click();
  }

  productNames(): Locator {
    return this.productList.getByTestId('product-name');
  }

  productPrices(): Locator {
    return this.productList.getByTestId('product-price');
  }
}
