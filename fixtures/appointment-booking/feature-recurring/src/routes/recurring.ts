import { Router } from 'express';
import { appointments, slots } from '../store';
import { layout } from '../views/layout';
import { respond, wantsJson } from '../respond';
import { bookingFailure } from './book';
import { bookSeries } from '../services/recurring';

export const recurringRouter = Router();

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue 14 Jul, 10:00" in UTC (clinic time). */
function short(iso: string): string {
  const d = new Date(iso);
  const t = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${t}`;
}

const repeating = (b: Record<string, unknown>) => b.repeat === 'on' || b.repeat === true;

recurringRouter.post('/api/appointments', (req, res, next) => {
  if (!repeating(req.body)) {
    next();
    return;
  }
  try {
    const booked = bookSeries(req.body);
    respond(req, res, `/book/series?ids=${booked.map((a) => a.id).join(',')}`, { appointments: booked }, 201);
  } catch (e) {
    bookingFailure(req, res, e);
  }
});

recurringRouter.get('/book/series', (req, res) => {
  const ids = String(req.query.ids ?? '').split(',');
  const items = ids
    .map((id) => appointments.find((a) => a.id === id))
    .filter((a) => a !== undefined)
    .map((a, i) => {
      const startsAt = slots.find((s) => s.id === a.slotId)!.startsAt;
      return `<li data-testid="series-item"><a href="/appointments/${a.id}">${i + 1}. ${short(startsAt)}</a></li>`;
    })
    .join('');
  res.send(layout('Booked', `<h1 data-testid="series-heading">Your appointments are booked</h1><div class="card"><ul data-testid="series-list">${items}</ul></div><a href="/appointments" data-testid="series-view-all">View my appointments</a>`));
});
