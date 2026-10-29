import { test, expect } from '../fixtures';
import { SLOT } from '../helpers/seed';

test.describe('API', () => {
  test('services endpoint returns four services', async ({ request }) => {
    const body = await (await request.get('/api/services')).json();
    expect(body).toHaveLength(4);
  });

  test('provider slots endpoint lists 70 free slots', async ({ request }) => {
    const body = await (await request.get('/api/providers/prov_1/slots')).json();
    expect(body).toHaveLength(70);
    expect(body[0].id).toBe(SLOT.prov1First);
  });

  test('unknown provider slots return 404', async ({ request }) => {
    const res = await request.get('/api/providers/nope/slots');
    expect(res.status()).toBe(404);
  });

  test('reset restores the seed after bookings', async ({ request }) => {
    await request.post('/api/appointments', {
      data: { slotId: SLOT.prov1First, serviceId: 'svc_general', name: 'A', phone: '1' },
    });
    await request.post('/api/test/reset');
    expect(await (await request.get('/api/appointments')).json()).toEqual([]);
  });
});
