import { Router } from 'express';
import { appointments, providers, services, slots } from '../store';
import { layout } from '../views/layout';
import { esc, when } from '../format';
import { inr } from '../money';
import { respond, wantsJson } from '../respond';
import { BookingError } from '../services/booking';
import { LATE_CANCEL_FEE_INR, WINDOW_HOURS, canReschedule, cancelWithPolicy, feeFor } from '../services/reschedule';
import { rescheduleRouter } from './reschedule';
import type { Appointment } from '../types';

export const appointmentsRouter = Router();
appointmentsRouter.use(rescheduleRouter);

const startOf = (a: Appointment) => slots.find((s) => s.id === a.slotId)!.startsAt;
const providerOf = (a: Appointment) => providers.find((p) => p.id === a.providerId)!;
const serviceOf = (a: Appointment) => services.find((s) => s.id === a.serviceId)!;

function cancelForm(a: Appointment, extra = '', withReason = false): string {
  if (a.status !== 'BOOKED') return '';
  if (feeFor(a) > 0) {
    return `<a href="/appointments/${a.id}?confirmCancel=1" class="button danger${extra}" data-testid="cancel-${a.id}">Cancel</a>`;
  }
  const reason = withReason ? reasonSelect() : '';
  return `<form method="post" action="/api/appointments/${a.id}/cancel">${reason}<button type="submit" class="danger${extra}" data-testid="cancel-${a.id}">Cancel</button></form>`;
}

function reasonSelect(): string {
  return `<label for="cancellationReason">Reason</label><select id="cancellationReason" name="cancellationReason" data-testid="cancel-reason"><option value="PATIENT_REQUEST">I no longer need it</option><option value="SCHEDULE_CONFLICT">Schedule conflict</option></select>`;
}

function feeNotice(a: Appointment): string {
  return `<div class="banner error" role="alert" data-testid="fee-notice">Cancelling less than ${WINDOW_HOURS} hours before your appointment costs ${inr(LATE_CANCEL_FEE_INR)}. Do you want to cancel anyway?</div>
<form method="post" action="/api/appointments/${a.id}/cancel">${reasonSelect()}
  <a href="/appointments/${a.id}" class="button" data-testid="keep-appointment">Keep appointment</a>
  <button type="submit" class="danger" data-testid="confirm-cancel-fee">Cancel and accept fee</button>
</form>`;
}

appointmentsRouter.get('/appointments', (req, res) => {
  const cancelled = req.query.cancelled ? String(req.query.cancelled) : '';
  const banner = cancelled
    ? `<div class="banner ok" role="status" data-testid="cancelled-banner">Your appointment has been cancelled.${req.query.fee ? ` A ${inr(Number(req.query.fee))} late-cancellation fee applies.` : ''} (Reference ${esc(cancelled)})</div>`
    : '';
  const sorted = [...appointments].sort((a, b) => startOf(a).localeCompare(startOf(b)));
  const body = sorted.length
    ? `<table data-testid="appointment-list"><thead><tr><th>When</th><th>Provider</th><th>Service</th><th>Status</th><th></th></tr></thead><tbody>${sorted
        .map(
          (a) => `<tr data-testid="appointment-${a.id}">
  <td><a href="/appointments/${a.id}" data-testid="appointment-link">${when(startOf(a))}</a></td>
  <td data-testid="appointment-provider">${providerOf(a).name}</td>
  <td>${serviceOf(a).name}</td>
  <td><span class="status ${a.status}" data-testid="appointment-status">${a.status}</span></td>
  <td>${cancelForm(a, ' small')}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : `<div class="empty" data-testid="no-appointments">You have no appointments yet. <a href="/book">Book one</a>.</div>`;
  res.send(layout('My appointments', `<h1>My appointments</h1><p class="sub">Upcoming and past visits.</p>${banner}${body}`));
});

appointmentsRouter.get('/appointments/:id', (req, res) => {
  const a = appointments.find((x) => x.id === req.params.id);
  if (!a) {
    res.status(404).send(layout('Not found', `<h1>Appointment not found</h1><div class="banner error" data-testid="not-found">No appointment ${esc(req.params.id)}.</div><a href="/appointments">Back to my appointments</a>`));
    return;
  }
  const confirmed = req.query.confirmed
    ? `<div class="banner ok" role="status" data-testid="confirmation">Booking confirmed. Reference <strong data-testid="confirmation-id">${a.id}</strong>.</div>`
    : '';
  const moved = req.query.rescheduled
    ? `<div class="banner ok" role="status" data-testid="reschedule-success">Your appointment has been moved to the new time.</div>`
    : '';
  const fee = a.feeInr
    ? `<dt>Fee</dt><dd data-testid="detail-fee">${inr(a.feeInr)} late-cancellation fee applies</dd>`
    : '';
  const actions = req.query.confirmCancel && a.status === 'BOOKED' && feeFor(a) > 0 ? feeNotice(a) : cancelForm(a, '', true);
  const reschedule =
    canReschedule(a) && !req.query.confirmCancel
      ? `<a href="/appointments/${a.id}/reschedule" class="button" data-testid="reschedule-${a.id}">Reschedule appointment</a>`
      : '';
  res.send(
    layout(
      `Appointment ${a.id}`,
      `<h1>Appointment <span data-testid="detail-id">${a.id}</span></h1>
${confirmed}${moved}
<div class="card" data-testid="detail">
<dl>
  <dt>Status</dt><dd><span class="status ${a.status}" data-testid="detail-status">${a.status}</span></dd>
  <dt>When</dt><dd data-testid="detail-when">${when(startOf(a))}</dd>
  <dt>Provider</dt><dd data-testid="detail-provider">${providerOf(a).name}</dd>
  <dt>Service</dt><dd data-testid="detail-service">${serviceOf(a).name} · ${inr(serviceOf(a).priceInr)}</dd>
  <dt>Patient</dt><dd data-testid="detail-patient">${esc(a.patientName)}</dd>
  <dt>Phone</dt><dd data-testid="detail-phone">${esc(a.phone)}</dd>
  ${fee}
</dl>
${reschedule}
${actions}
</div>
<a href="/appointments" data-testid="back-to-list">Back to my appointments</a>`,
    ),
  );
});

appointmentsRouter.get('/api/appointments', (_req, res) => {
  res.json(appointments);
});

appointmentsRouter.get('/api/appointments/:id', (req, res) => {
  const a = appointments.find((x) => x.id === req.params.id);
  if (!a) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(a);
});

appointmentsRouter.post('/api/appointments/:id/cancel', (req, res) => {
  try {
    const a = cancelWithPolicy(req.params.id, req.body);
    respond(req, res, `/appointments?cancelled=${a.id}${a.feeInr ? `&fee=${a.feeInr}` : ''}`, a);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    if (wantsJson(req)) {
      res.status(e.status).json({ error: e.code, message: e.message });
      return;
    }
    res.status(e.status).send(layout('Error', `<h1>Could not cancel</h1><div class="banner error" role="alert" data-testid="cancel-error">${e.code}: ${e.message}</div><a href="/appointments">Back to my appointments</a>`));
  }
});
