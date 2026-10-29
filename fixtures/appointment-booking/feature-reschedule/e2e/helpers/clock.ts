import type { APIRequestContext } from '@playwright/test';

/** Move the server's fake clock and reseed (appointments are wiped); call before booking. */
export async function setClock(request: APIRequestContext, iso: string) {
  await request.post('/api/test/reset', { data: { now: iso } });
}
