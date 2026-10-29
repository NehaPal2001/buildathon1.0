import type { Locator, Page } from '@playwright/test';

export class AppointmentDetailPage {
  readonly confirmation: Locator;
  readonly confirmationId: Locator;
  readonly id: Locator;
  readonly status: Locator;
  readonly when: Locator;
  readonly provider: Locator;
  readonly service: Locator;
  readonly patient: Locator;
  readonly phone: Locator;
  readonly notFound: Locator;
  readonly backToList: Locator;

  constructor(readonly page: Page) {
    this.confirmation = page.getByTestId('confirmation');
    this.confirmationId = page.getByTestId('confirmation-id');
    this.id = page.getByTestId('detail-id');
    this.status = page.getByTestId('detail-status');
    this.when = page.getByTestId('detail-when');
    this.provider = page.getByTestId('detail-provider');
    this.service = page.getByTestId('detail-service');
    this.patient = page.getByTestId('detail-patient');
    this.phone = page.getByTestId('detail-phone');
    this.notFound = page.getByTestId('not-found');
    this.backToList = page.getByTestId('back-to-list');
  }

  async goto(id: string) {
    await this.page.goto('/appointments');
    await this.page.getByTestId(`appointment-${id}`).getByTestId('appointment-link').click();
  }

  cancelButton(id: string): Locator {
    return this.page.getByTestId(`cancel-${id}`);
  }

  async cancel(id: string) {
    await this.cancelButton(id).click();
  }
}
