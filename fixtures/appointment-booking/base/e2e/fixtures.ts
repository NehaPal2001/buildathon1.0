import { test as base } from '@playwright/test';
import { ServicesPage } from './pages/ServicesPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { BookingPage } from './pages/BookingPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AppointmentDetailPage } from './pages/AppointmentDetailPage';
import { AccountPage } from './pages/AccountPage';

type Pages = {
  services: ServicesPage;
  providers: ProvidersPage;
  booking: BookingPage;
  appointments: AppointmentsPage;
  detail: AppointmentDetailPage;
  account: AccountPage;
};

/** The server clock is frozen via FAKE_NOW (see playwright.config.ts); reseed before every test. */
export const FAKE_NOW = '2026-03-02T08:00:00.000Z';

export const test = base.extend<Pages & { resetStore: void }>({
  resetStore: [
    async ({ request }, use) => {
      await request.post('/api/test/reset', { data: { now: FAKE_NOW } });
      await use();
    },
    { auto: true },
  ],
  services: async ({ page }, use) => { await use(new ServicesPage(page)); },
  providers: async ({ page }, use) => { await use(new ProvidersPage(page)); },
  booking: async ({ page }, use) => { await use(new BookingPage(page)); },
  appointments: async ({ page }, use) => { await use(new AppointmentsPage(page)); },
  detail: async ({ page }, use) => { await use(new AppointmentDetailPage(page)); },
  account: async ({ page }, use) => { await use(new AccountPage(page)); },
});

export { expect } from '@playwright/test';
