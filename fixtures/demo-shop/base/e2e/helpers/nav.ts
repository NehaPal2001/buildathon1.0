import type { Page } from '@playwright/test';

export const sections = {
  home: '/',
  search: '/search',
  account: '/account',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
} as const;

export type Section = keyof typeof sections;

export async function goToSection(page: Page, section: Section) {
  await page.goto(sections[section]);
}
