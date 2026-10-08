import type { Locator, Page } from '@playwright/test';

export class CheckoutPage {
  readonly subtotal: Locator;
  readonly total: Locator;
  readonly empty: Locator;
  readonly error: Locator;
  readonly placeOrderButton: Locator;

  constructor(readonly page: Page) {
    this.subtotal = page.getByTestId('subtotal');
    this.total = page.getByTestId('total');
    this.empty = page.getByTestId('checkout-empty');
    this.error = page.getByTestId('checkout-error');
    this.placeOrderButton = page.getByTestId('place-order');
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  async placeOrder(name: string, address: string) {
    await this.page.getByTestId('ship-name').fill(name);
    await this.page.getByTestId('ship-address').fill(address);
    await this.placeOrderButton.click();
  }
}
