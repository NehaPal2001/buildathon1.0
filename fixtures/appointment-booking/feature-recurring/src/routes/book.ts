import { Router } from 'express';
import type { Request, Response } from 'express';
import { profile, providers, services, slots } from '../store';
import { layout } from '../views/layout';
import { esc, when } from '../format';
import { inr } from '../money';
import { respond, wantsJson } from '../respond';
import { BookingError, bookAppointment } from '../services/booking';

export const bookRouter = Router();

function renderBook(providerId: string, error?: string, values: Record<string, string> = {}): string {
  const providerOptions = providers
    .map((p) => `<option value="${p.id}"${p.id === providerId ? ' selected' : ''}>${p.name} (${p.specialty})</option>`)
    .join('');
  const chooser = `
<form method="get" action="/book" class="row" data-testid="provider-form">
  <div><label for="providerId">Provider</label>
  <select id="providerId" name="providerId" data-testid="provider-select">
    <option value="">Choose a provider…</option>${providerOptions}
  </select></div>
  <button type="submit" data-testid="provider-continue">Continue</button>
</form>`;
  const provider = providers.find((p) => p.id === providerId);
  const err = error ? `<div class="banner error" role="alert" data-testid="book-error">${esc(error)}</div>` : '';
  if (!provider) {
    return layout('Book', `<h1>Book an appointment</h1><p class="sub">Start by choosing a provider.</p>${err}<div class="card">${chooser}</div>`);
  }
  const serviceOptions = provider.serviceIds
    .map((id) => services.find((s) => s.id === id)!)
    .map((s) => `<option value="${s.id}"${s.id === values.serviceId ? ' selected' : ''}>${s.name} · ${inr(s.priceInr)}</option>`)
    .join('');
  const free = slots.filter((s) => s.providerId === provider.id && !s.appointmentId);
  const slotOptions = free
    .map((s) => `<option value="${s.id}"${s.id === values.slotId ? ' selected' : ''}>${when(s.startsAt)}</option>`)
    .join('');
  const name = values.name ?? profile.name;
  const phone = values.phone ?? profile.phone;
  return layout(
    'Book',
    `<h1>Book an appointment</h1><p class="sub">with <strong data-testid="chosen-provider">${provider.name}</strong> · ${provider.specialty}</p>
${err}
<div class="card">${chooser}</div>
<form method="post" action="/api/appointments" class="card" data-testid="book-form">
  <input type="hidden" name="providerId" value="${provider.id}">
  <label for="serviceId">Service</label>
  <select id="serviceId" name="serviceId" data-testid="service-select">${serviceOptions}</select>
  <label for="slotId">Time slot (${free.length} available)</label>
  <select id="slotId" name="slotId" data-testid="slot-select">${slotOptions}</select>
  <label for="name">Patient name</label>
  <input id="name" name="name" value="${esc(name)}" data-testid="patient-name">
  <label for="phone">Phone</label>
  <input id="phone" name="phone" value="${esc(phone)}" inputmode="tel" data-testid="patient-phone">
  <h2>Repeat this appointment</h2>
  <label class="check"><input type="checkbox" name="repeat" value="on"${values.repeat ? ' checked' : ''} data-testid="repeat-toggle"> Repeat weekly</label>
  <input type="hidden" name="frequency" value="WEEKLY">
  <label for="occurrences">Number of appointments (2 to 8)</label>
  <input id="occurrences" name="occurrences" type="number" min="2" max="8" value="${esc(values.occurrences ?? '2')}" data-testid="repeat-count">
  <button type="submit" data-testid="book-submit">Confirm booking</button>
</form>`,
  );
}

bookRouter.get('/book', (req, res) => {
  res.send(renderBook(String(req.query.providerId ?? '')));
});

export function bookingFailure(req: Request, res: Response, e: unknown): void {
  if (!(e instanceof BookingError)) throw e;
  if (wantsJson(req)) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return;
  }
  const slot = slots.find((s) => s.id === req.body.slotId);
  const providerId = String(req.body.providerId ?? slot?.providerId ?? '');
  res.status(e.status).send(renderBook(providerId, `${e.code}: ${e.message}`, req.body));
}

bookRouter.post('/api/appointments', (req, res) => {
  try {
    const appt = bookAppointment(req.body);
    respond(req, res, `/appointments/${appt.id}?confirmed=1`, appt, 201);
  } catch (e) {
    bookingFailure(req, res, e);
  }
});
