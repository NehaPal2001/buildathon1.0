import { slots } from '../store';
import { BookingError, BookingInput, bookAppointment } from './booking';
import type { Appointment, Slot } from '../types';

export const FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface SeriesInput extends BookingInput {
  frequency?: string;
  occurrences?: unknown;
}

export const MAX_OCCURRENCES = 8;

function occurrenceStart(firstIso: string, frequency: Frequency, n: number): string {
  const d = new Date(firstIso);
  if (frequency === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCDate(d.getUTCDate() + n * (frequency === 'BIWEEKLY' ? 14 : 7));
  return d.toISOString();
}

/** Slot for a provider at an exact time; later weeks are opened on demand beyond the seeded horizon. */
function slotAt(providerId: string, startsAt: string): Slot {
  let slot = slots.find((s) => s.providerId === providerId && s.startsAt === startsAt);
  if (!slot) {
    slot = { id: `slot_${String(slots.length + 1).padStart(4, '0')}`, providerId, startsAt, appointmentId: null };
    slots.push(slot);
  }
  return slot;
}

function claimFirst(slot: Slot): void {
  if (slot.appointmentId) throw new Error(`Slot ${slot.id} is already booked by ${slot.appointmentId}`);
}

export function bookSeries(input: SeriesInput): Appointment[] {
  const frequency = (input.frequency ?? 'WEEKLY') as Frequency;
  if (!FREQUENCIES.includes(frequency)) {
    throw new BookingError('VALIDATION', 400, 'Frequency must be WEEKLY, BIWEEKLY or MONTHLY.');
  }
  const occurrences = Number(input.occurrences);
  if (!Number.isInteger(occurrences) || occurrences > MAX_OCCURRENCES) {
    throw new BookingError('VALIDATION', 400, 'Please choose between 2 and 8 appointments.');
  }
  const first = slots.find((s) => s.id === input.slotId);
  if (first) claimFirst(first);
  const booked: Appointment[] = [bookAppointment(input)];
  for (let n = 1; n < occurrences; n++) {
    const next = slotAt(first!.providerId, occurrenceStart(first!.startsAt, frequency, n));
    if (next.appointmentId) continue;
    booked.push(bookAppointment({ ...input, slotId: next.id }));
  }
  return booked;
}
