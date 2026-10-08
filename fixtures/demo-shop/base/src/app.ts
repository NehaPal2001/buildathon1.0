import express from 'express';
import { session } from './session';
import { catalogueRouter } from './routes/catalogue';
import { searchRouter } from './routes/search';
import { accountRouter } from './routes/account';
import { cartRouter } from './routes/cart';
import { checkoutRouter } from './routes/checkout';
import { ordersRouter } from './routes/orders';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(session);
  app.use(catalogueRouter);
  app.use(searchRouter);
  app.use(accountRouter);
  app.use(cartRouter);
  app.use(checkoutRouter);
  app.use(ordersRouter);
  return app;
}
