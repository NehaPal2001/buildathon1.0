import { test, expect } from '../fixtures';

test.describe('Coupons', () => {
  test('a percent coupon reduces the total', async ({ cart, checkout }) => {
    await cart.addProduct('p3'); // ₹1299
    await checkout.goto();
    await checkout.applyCoupon('SAVE20');
    await expect(checkout.appliedCoupon('SAVE20')).toBeVisible();
    await expect(checkout.discount).toHaveText('₹260');
    await expect(checkout.total).toHaveText('₹1039');
  });

  test('a flat coupon reduces the total', async ({ cart, checkout }) => {
    await cart.addProduct('p5'); // ₹899
    await checkout.goto();
    await checkout.applyCoupon('FLAT100');
    await expect(checkout.discount).toHaveText('₹100');
    await expect(checkout.total).toHaveText('₹799');
  });

  test('an invalid code shows an error', async ({ cart, checkout }) => {
    await cart.addProduct('p1');
    await checkout.goto();
    await checkout.applyCoupon('BADCODE');
    await expect(checkout.couponError).toHaveText("That coupon code isn't valid.");
    await expect(checkout.appliedCoupons).toHaveCount(0);
  });
});
