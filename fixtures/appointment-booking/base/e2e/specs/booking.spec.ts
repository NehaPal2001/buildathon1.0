import { test, expect } from '../fixtures';
import { SLOT, createAppointment } from '../helpers/seed';

test.describe('Booking', () => {
  test('choosing a provider reveals the booking form', async ({ booking }) => {
    await booking.goto();
    await booking.chooseProvider('prov_1');
    await expect(booking.chosenProvider).toHaveText('Dr. Asha Rao');
    await expect(booking.slotOptions()).toHaveCount(70);
  });

  test('happy path ends on a confirmation', async ({ booking, detail }) => {
    await booking.goto('prov_1');
    await booking.book({ slotId: SLOT.prov1First, name: 'Priya Nair', phone: '9876543210' });
    await expect(detail.confirmation).toBeVisible();
    await expect(detail.confirmationId).toHaveText('apt_0001');
    await expect(detail.status).toHaveText('BOOKED');
  });

  test('confirmation shows the chosen time in clinic time', async ({ booking, detail }) => {
    await booking.goto('prov_1');
    await booking.book({ slotId: SLOT.prov1First, name: 'Priya Nair', phone: '9876543210' });
    await expect(detail.when).toHaveText('Tue 3 Mar 2026, 09:00');
  });

  test('name is required', async ({ booking }) => {
    await booking.goto('prov_1');
    await booking.book({ name: '', phone: '9876543210' });
    await expect(booking.error).toContainText('Name and phone are required');
  });

  test('phone is required', async ({ booking }) => {
    await booking.goto('prov_1');
    await booking.book({ name: 'Priya Nair', phone: '' });
    await expect(booking.error).toContainText('VALIDATION');
  });

  test('a taken slot is rejected with SLOT_TAKEN', async ({ request }) => {
    await createAppointment(request);
    const res = await request.post('/api/appointments', {
      data: { slotId: SLOT.prov1First, serviceId: 'svc_general', name: 'Arjun', phone: '9000000000' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('SLOT_TAKEN');
  });

  test('a booked slot disappears from the form', async ({ request, booking }) => {
    await createAppointment(request);
    await booking.goto('prov_1');
    await expect(booking.slotOptions()).toHaveCount(69);
    await expect(booking.slotSelect).not.toContainText('Tue 3 Mar 2026, 09:00');
  });
});
