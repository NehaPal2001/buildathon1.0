import type { Locator, Page } from '@playwright/test';

export class CheckoutPage {
  readonly subtotal: Locator;
  readonly total: Locator;
  readonly discount: Locator;
  readonly empty: Locator;
  readonly error: Locator;
  readonly couponError: Locator;
  readonly appliedCoupons: Locator;
  readonly placeOrderButton: Locator;

  constructor(readonly page: Page) {
    this.subtotal = page.getByTestId('subtotal');
    this.total = page.getByTestId('total');
    this.discount = page.getByTestId('discount');
    this.empty = page.getByTestId('checkout-empty');
    this.error = page.getByTestId('checkout-error');
    this.couponError = page.getByTestId('coupon-error');
    this.appliedCoupons = page.getByTestId('applied-coupons').locator('li');
    this.placeOrderButton = page.getByTestId('place-order');
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  async applyCoupon(code: string) {
    await this.page.getByTestId('coupon-input').fill(code);
    await this.page.getByRole('button', { name: 'Apply' }).click();
  }

  appliedCoupon(code: string): Locator {
    return this.page.getByTestId(`applied-${code}`);
  }

  async placeOrder(name: string, address: string) {
    await this.page.getByTestId('ship-name').fill(name);
    await this.page.getByTestId('ship-address').fill(address);
    await this.placeOrderButton.click();
  }
}
