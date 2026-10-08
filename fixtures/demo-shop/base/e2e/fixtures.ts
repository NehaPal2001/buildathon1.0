import { test as base } from '@playwright/test';
import { CataloguePage } from './pages/CataloguePage';
import { SearchPage } from './pages/SearchPage';
import { AccountPage } from './pages/AccountPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';

type Pages = {
  catalogue: CataloguePage;
  search: SearchPage;
  account: AccountPage;
  cart: CartPage;
  checkout: CheckoutPage;
  orders: OrdersPage;
};

export const test = base.extend<Pages>({
  catalogue: async ({ page }, use) => { await use(new CataloguePage(page)); },
  search: async ({ page }, use) => { await use(new SearchPage(page)); },
  account: async ({ page }, use) => { await use(new AccountPage(page)); },
  cart: async ({ page }, use) => { await use(new CartPage(page)); },
  checkout: async ({ page }, use) => { await use(new CheckoutPage(page)); },
  orders: async ({ page }, use) => { await use(new OrdersPage(page)); },
});

export { expect } from '@playwright/test';
