import type { Page } from '@playwright/test';

export const sections = {
  services: '/',
  providers: '/providers',
  book: '/book',
  appointments: '/appointments',
  account: '/account',
} as const;

export type Section = keyof typeof sections;

export async function goToSection(page: Page, section: Section) {
  await page.goto(sections[section]);
}
