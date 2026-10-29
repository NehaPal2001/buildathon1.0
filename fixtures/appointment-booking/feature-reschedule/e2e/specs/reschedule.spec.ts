import { test, expect } from '../fixtures';
import { SLOT, createAppointment } from '../helpers/seed';
import { setClock } from '../helpers/clock';

test.describe('Reschedule and late cancellation', () => {
  test('reschedules an appointment to another slot', async ({ request, detail }) => {
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await expect(detail.when).toHaveText('Tue 3 Mar 2026, 09:00');
    await detail.reschedule(id, SLOT.prov1Second);
    await expect(detail.rescheduleSuccess).toBeVisible();
    await expect(detail.when).toHaveText('Tue 3 Mar 2026, 10:00');
    await expect(detail.id).toHaveText(id);
  });

  test('cancelling more than 24 hours ahead is free', async ({ request, detail, appointments }) => {
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await detail.cancel(id);
    await expect(detail.feeNotice).toHaveCount(0);
    await expect(appointments.cancelledBanner).toContainText('Your appointment has been cancelled.');
    await expect(appointments.cancelledBanner).not.toContainText('late-cancellation fee');
    await expect(appointments.statusOf(id)).toHaveText('CANCELLED');
  });

  test('cancelling less than 24 hours ahead shows the fee notice', async ({ request, detail, appointments }) => {
    await setClock(request, '2026-03-02T20:00:00.000Z');
    const { id } = await createAppointment(request);
    await detail.goto(id);
    await expect(detail.rescheduleButton(id)).toHaveCount(0);
    await detail.cancel(id);
    await expect(detail.feeNotice).toContainText('costs ₹300');
    await detail.confirmFeeCancel();
    await expect(appointments.cancelledBanner).toContainText('A ₹300 late-cancellation fee applies.');
    await detail.goto(id);
    await expect(detail.fee).toContainText('₹300');
  });
});
