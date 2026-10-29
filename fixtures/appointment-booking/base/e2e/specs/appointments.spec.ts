import { test, expect } from '../fixtures';
import { SLOT, createAppointment } from '../helpers/seed';

test.describe('My appointments', () => {
  test('shows an empty state with no appointments', async ({ appointments }) => {
    await appointments.goto();
    await expect(appointments.empty).toBeVisible();
  });

  test('lists a booked appointment', async ({ request, appointments }) => {
    const { id } = await createAppointment(request);
    await appointments.goto();
    await expect(appointments.rows).toHaveCount(1);
    await expect(appointments.statusOf(id)).toHaveText('BOOKED');
    await expect(appointments.providerOf(id)).toHaveText('Dr. Asha Rao');
  });

  test('sorts appointments by time', async ({ request, appointments }) => {
    const later = await createAppointment(request, { slotId: SLOT.prov1Second });
    const earlier = await createAppointment(request, { slotId: SLOT.prov1First });
    await appointments.goto();
    await expect(appointments.rows.first()).toHaveAttribute('data-testid', `appointment-${earlier.id}`);
    await expect(appointments.rows.last()).toHaveAttribute('data-testid', `appointment-${later.id}`);
  });

  test('cancelling marks the appointment cancelled', async ({ request, appointments }) => {
    const { id } = await createAppointment(request);
    await appointments.goto();
    await appointments.cancel(id);
    await expect(appointments.cancelledBanner).toContainText(id);
    await expect(appointments.statusOf(id)).toHaveText('CANCELLED');
  });

  test('a cancelled appointment has no cancel button', async ({ request, appointments }) => {
    const { id } = await createAppointment(request);
    await appointments.goto();
    await appointments.cancel(id);
    await expect(appointments.cancelButton(id)).toHaveCount(0);
  });

  test('cancelling frees the slot for rebooking', async ({ request, appointments }) => {
    const { id } = await createAppointment(request);
    await appointments.goto();
    await appointments.cancel(id);
    const res = await request.post('/api/appointments', {
      data: { slotId: SLOT.prov1First, serviceId: 'svc_general', name: 'Arjun', phone: '9000000000' },
    });
    expect(res.status()).toBe(201);
  });
});
