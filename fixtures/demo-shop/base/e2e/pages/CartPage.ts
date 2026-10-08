import type { Locator, Page } from '@playwright/test';

export class CartPage {
  readonly items: Locator;
  readonly empty: Locator;
  readonly subtotal: Locator;

  constructor(readonly page: Page) {
    this.items = page.getByTestId('cart-items').locator('li');
    this.empty = page.getByTestId('cart-empty');
    this.subtotal = page.getByTestId('cart-subtotal');
  }

  async goto() {
    await this.page.goto('/cart');
  }

  /** Seed the cart through the API so tests don't depend on the catalogue page. */
  async addProduct(productId: string, qty = 1) {
    await this.page.request.post('/api/cart/items', { form: { productId, qty: String(qty) } });
  }

  item(id: string): Locator {
    return this.page.getByTestId(`cart-item-${id}`);
  }

  qtyOf(id: string): Locator {
    return this.item(id).getByTestId('item-qty');
  }

  async remove(id: string) {
    await this.page.getByTestId(`remove-${id}`).click();
  }

  async goToCheckout() {
    // test id, not role: the header nav also has a link named "Checkout"
    await this.page.getByTestId('go-to-checkout').click();
  }
}
