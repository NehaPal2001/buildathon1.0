import type { Locator, Page } from '@playwright/test';

export interface BookingDetails {
  slotId?: string;
  serviceId?: string;
  name?: string;
  phone?: string;
}

export class BookingPage {
  readonly providerSelect: Locator;
  readonly chosenProvider: Locator;
  readonly serviceSelect: Locator;
  readonly slotSelect: Locator;
  readonly nameInput: Locator;
  readonly phoneInput: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.providerSelect = page.getByTestId('provider-select');
    this.chosenProvider = page.getByTestId('chosen-provider');
    this.serviceSelect = page.getByTestId('service-select');
    this.slotSelect = page.getByTestId('slot-select');
    this.nameInput = page.getByTestId('patient-name');
    this.phoneInput = page.getByTestId('patient-phone');
    this.submit = page.getByTestId('book-submit');
    this.error = page.getByTestId('book-error');
  }

  async goto(providerId?: string) {
    await this.page.goto('/book');
    if (providerId) await this.chooseProvider(providerId);
  }

  async chooseProvider(providerId: string) {
    await this.providerSelect.selectOption(providerId);
    await this.page.getByTestId('provider-continue').click();
  }

  slotOptions(): Locator {
    return this.slotSelect.locator('option');
  }

  async fill(d: BookingDetails) {
    if (d.serviceId) await this.serviceSelect.selectOption(d.serviceId);
    if (d.slotId) await this.slotSelect.selectOption(d.slotId);
    if (d.name !== undefined) await this.nameInput.fill(d.name);
    if (d.phone !== undefined) await this.phoneInput.fill(d.phone);
  }

  async book(d: BookingDetails) {
    await this.fill(d);
    await this.submit.click();
  }
}
