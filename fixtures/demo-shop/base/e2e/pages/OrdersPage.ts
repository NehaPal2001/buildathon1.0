import type { Locator, Page } from '@playwright/test';

export class OrdersPage {
  readonly placedBanner: Locator;
  readonly noOrders: Locator;
  readonly orders: Locator;

  constructor(readonly page: Page) {
    this.placedBanner = page.getByTestId('order-placed');
    this.noOrders = page.getByTestId('no-orders');
    this.orders = page.getByTestId('order-list').locator('li');
  }

  async goto() {
    await this.page.goto('/orders');
  }

  order(id: string): Locator {
    return this.page.getByTestId(`order-${id}`);
  }

  totalOf(id: string): Locator {
    return this.order(id).getByTestId('order-total');
  }
}
