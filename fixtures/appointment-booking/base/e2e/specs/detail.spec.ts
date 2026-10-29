import { test, expect } from '../fixtures';
import { createAppointment } from '../helpers/seed';

test.describe('Appointment detail', () => {
  test('shows all appointment facts', async ({ request, detail }) => {
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await expect(detail.id).toHaveText(id);
    await expect(detail.provider).toHaveText('Dr. Asha Rao');
    await expect(detail.service).toHaveText('General consultation · ₹500');
    await expect(detail.patient).toHaveText('Priya Nair');
    await expect(detail.phone).toHaveText('9876543210');
  });

  test('does not show the confirmation banner on a plain visit', async ({ request, detail }) => {
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await expect(detail.confirmation).toHaveCount(0);
  });

  test('cancelling from the detail page returns to the list', async ({ request, detail, appointments, page }) => {
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await detail.cancel(id);
    await expect(page).toHaveURL(/\/appointments\?cancelled=/);
    await expect(appointments.statusOf(id)).toHaveText('CANCELLED');
  });

  test('unknown appointment shows not found', async ({ page, detail }) => {
    const res = await page.goto('/appointments/apt_9999');
    expect(res?.status()).toBe(404);
    await expect(detail.notFound).toContainText('apt_9999');
  });
});
