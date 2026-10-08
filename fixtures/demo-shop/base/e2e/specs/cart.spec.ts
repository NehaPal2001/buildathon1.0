import { test, expect } from '../fixtures';

test.describe('Cart', () => {
  test('is empty for a new visitor', async ({ cart }) => {
    await cart.goto();
    await expect(cart.empty).toBeVisible();
    await expect(cart.items).toHaveCount(0);
  });

  test('adding from the catalogue shows the item in the cart', async ({ catalogue, cart }) => {
    await catalogue.goto();
    await catalogue.addToCart('p2');
    await expect(cart.page).toHaveURL(/\/cart$/);
    await expect(cart.item('p2')).toBeVisible();
  });

  test('adding the same product twice increases its quantity', async ({ catalogue, cart }) => {
    await catalogue.goto();
    await catalogue.addToCart('p4');
    await catalogue.goto();
    await catalogue.addToCart('p4');
    await expect(cart.qtyOf('p4')).toHaveText('2');
  });

  test('subtotal is the sum of the line totals', async ({ cart }) => {
    await cart.addProduct('p1');
    await cart.addProduct('p6', 2);
    await cart.goto();
    await expect(cart.subtotal).toHaveText('₹847');
  });

  test('removing an item updates the subtotal', async ({ cart }) => {
    await cart.addProduct('p1');
    await cart.addProduct('p2');
    await cart.goto();
    await cart.remove('p2');
    await expect(cart.item('p2')).toHaveCount(0);
    await expect(cart.subtotal).toHaveText('₹349');
  });

  test('checkout link leads to the checkout page', async ({ cart }) => {
    await cart.addProduct('p1');
    await cart.goto();
    await cart.goToCheckout();
    await expect(cart.page).toHaveURL(/\/checkout$/);
  });
});
