import express from 'express';
import { servicesRouter } from './routes/services';
import { providersRouter } from './routes/providers';
import { bookRouter } from './routes/book';
import { appointmentsRouter } from './routes/appointments';
import { accountRouter } from './routes/account';
import { testRouter } from './routes/test';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(servicesRouter);
  app.use(providersRouter);
  app.use(bookRouter);
  app.use(appointmentsRouter);
  app.use(accountRouter);
  app.use(testRouter);
  return app;
}
