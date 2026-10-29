import { test, expect } from '../fixtures';
import { SLOT } from '../helpers/seed';

test.describe('Recurring appointments', () => {
  test('weekly x3 books three appointments a week apart', async ({ booking, appointments }) => {
    await booking.goto('prov_1');
    await booking.book({ slotId: SLOT.prov1First, name: 'Priya Nair', phone: '9876543210', repeat: true, occurrences: 3 });
    await expect(booking.seriesItems).toHaveCount(3);
    await appointments.goto();
    await expect(appointments.rows).toHaveCount(3);
  });

  test('without repeat a single appointment is booked as before', async ({ booking, detail, appointments }) => {
    await booking.goto('prov_1');
    await booking.book({ slotId: SLOT.prov1First, name: 'Priya Nair', phone: '9876543210' });
    await expect(detail.confirmationId).toHaveText('apt_0001');
    await appointments.goto();
    await expect(appointments.rows).toHaveCount(1);
  });

  test('the summary lists every date', async ({ booking }) => {
    await booking.goto('prov_1');
    await booking.book({ slotId: SLOT.prov1First, name: 'Priya Nair', phone: '9876543210', repeat: true, occurrences: 3 });
    await expect(booking.seriesHeading).toHaveText('Your appointments are booked');
    await expect(booking.seriesItems).toHaveText(['1. Tue 3 Mar, 09:00', '2. Tue 10 Mar, 09:00', '3. Tue 17 Mar, 09:00']);
  });
});
