import { Router } from 'express';
import { appointments, providers, slots } from '../store';
import { layout } from '../views/layout';
import { esc, when } from '../format';
import { respond, wantsJson } from '../respond';
import { BookingError } from '../services/booking';
import { canReschedule, rescheduleAppointment } from '../services/reschedule';

export const rescheduleRouter = Router();

rescheduleRouter.get('/appointments/:id/reschedule', (req, res) => {
  const a = appointments.find((x) => x.id === req.params.id);
  if (!a || !canReschedule(a)) {
    res.status(a ? 422 : 404).send(
      layout('Reschedule', `<h1>Reschedule</h1><div class="banner error" role="alert" data-testid="reschedule-error">This appointment cannot be rescheduled.</div><a href="/appointments">Back to my appointments</a>`),
    );
    return;
  }
  const provider = providers.find((p) => p.id === a.providerId)!;
  const free = slots.filter((s) => s.providerId === a.providerId && !s.appointmentId);
  const options = free.map((s) => `<option value="${s.id}">${when(s.startsAt)}</option>`).join('');
  res.send(
    layout(
      `Reschedule ${a.id}`,
      `<h1>Reschedule appointment <span>${a.id}</span></h1><p class="sub">with ${provider.name}</p>
<form method="post" action="/api/appointments/${a.id}/reschedule" class="card" data-testid="reschedule-form">
  <label for="newSlotId">New time (${free.length} available)</label>
  <select id="newSlotId" name="newSlotId" data-testid="reschedule-slot-select">${options}</select>
  <label for="reason">Reason (optional)</label>
  <input id="reason" name="reason" data-testid="reschedule-reason">
  <button type="submit" data-testid="reschedule-submit">Confirm new time</button>
</form>
<a href="/appointments/${a.id}">Keep current time</a>`,
    ),
  );
});

rescheduleRouter.post('/api/appointments/:id/reschedule', (req, res) => {
  try {
    const a = rescheduleAppointment(req.params.id, req.body);
    respond(req, res, `/appointments/${a.id}?rescheduled=1`, a);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    if (wantsJson(req)) {
      res.status(e.status).json({ error: e.code, message: e.message });
      return;
    }
    res.status(e.status).send(layout('Error', `<h1>Could not reschedule</h1><div class="banner error" role="alert" data-testid="reschedule-error">${esc(e.code)}: ${esc(e.message)}</div><a href="/appointments">Back to my appointments</a>`));
  }
});
