import { test, expect } from '../fixtures';

test.describe('Checkout', () => {
  test('tells an empty-cart visitor there is nothing to check out', async ({ checkout }) => {
    await checkout.goto();
    await expect(checkout.empty).toBeVisible();
  });

  test('place-order button is disabled when the cart is empty', async ({ checkout }) => {
    await checkout.goto();
    await expect(checkout.placeOrderButton).toBeDisabled();
  });

  // TRAP for M3 coverage: visits /checkout and reads totals but never applies a coupon.
  test('subtotal matches the cart', async ({ cart, checkout }) => {
    await cart.addProduct('p3');
    await cart.addProduct('p4');
    await checkout.goto();
    await expect(checkout.subtotal).toHaveText('₹1448');
  });

  test('total equals subtotal when nothing else applies', async ({ cart, checkout }) => {
    await cart.addProduct('p5');
    await checkout.goto();
    await expect(checkout.total).toHaveText('₹899');
  });

  test('placing an order without an address shows an error', async ({ cart, checkout }) => {
    await cart.addProduct('p1');
    await checkout.goto();
    await checkout.placeOrder('Asha', '');
    await expect(checkout.error).toHaveText('Name and address are required.');
  });

  test('placing an order clears the cart and lists it under orders', async ({ cart, checkout, orders }) => {
    await cart.addProduct('p3');
    await checkout.goto();
    await checkout.placeOrder('Asha', '1 Lake Road');
    await expect(orders.placedBanner).toBeVisible();
    // order ids are global and tests run in parallel: read the id we were given
    const id = (await orders.placedBanner.textContent())!.match(/Order (o\d+)/)![1];
    await expect(orders.totalOf(id)).toHaveText('₹1299');
    await cart.goto();
    await expect(cart.empty).toBeVisible();
  });
});
