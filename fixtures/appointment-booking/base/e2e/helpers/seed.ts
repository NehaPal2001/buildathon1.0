import type { APIRequestContext } from '@playwright/test';

/** Slot ids are deterministic after reset: prov_1 = slot_0001..0070, prov_2 = slot_0071.., etc. */
export const SLOT = { prov1First: 'slot_0001', prov1Second: 'slot_0002', prov2First: 'slot_0071' } as const;

export async function createAppointment(
  request: APIRequestContext,
  overrides: { slotId?: string; serviceId?: string; name?: string; phone?: string } = {},
) {
  const res = await request.post('/api/appointments', {
    data: { slotId: SLOT.prov1First, serviceId: 'svc_general', name: 'Priya Nair', phone: '9876543210', ...overrides },
  });
  return (await res.json()) as { id: string };
}
