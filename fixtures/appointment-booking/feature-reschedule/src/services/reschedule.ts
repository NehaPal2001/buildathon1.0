import { appointments, slots } from '../store';
import { now } from '../clock';
import type { Appointment } from '../types';
import { BookingError, cancelAppointment } from './booking';

export const LATE_CANCEL_FEE_INR = 300;
export const WINDOW_HOURS = 24;

export const CANCELLATION_REASONS = ['PATIENT_REQUEST', 'SCHEDULE_CONFLICT', 'PROVIDER_UNAVAILABLE'] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** Thrown when the requested new slot is already booked. */
export class SlotUnavailableError extends Error {
  readonly code = 'SLOT_TAKEN';
}

export function startsAtOf(a: Appointment): string {
  return slots.find((s) => s.id === a.slotId)!.startsAt;
}

export function hoursUntil(a: Appointment): number {
  return (new Date(startsAtOf(a)).getTime() - now().getTime()) / 3600000;
}

export function canReschedule(a: Appointment): boolean {
  return a.status === 'BOOKED' && hoursUntil(a) >= WINDOW_HOURS;
}

export function normaliseReason(raw: unknown): CancellationReason {
  switch (String(raw ?? '').trim().toUpperCase()) {
    case 'SCHEDULE_CONFLICT':
      return 'SCHEDULE_CONFLICT';
    case 'PROVIDER_UNAVAILABLE':
      return 'PROVIDER_UNAVAILABLE';
    default:
      return 'PATIENT_REQUEST';
  }
}

export function feeFor(a: Appointment, reason: CancellationReason = 'PATIENT_REQUEST'): number {
  if (reason === 'PROVIDER_UNAVAILABLE') return 0;
  return hoursUntil(a) < WINDOW_HOURS ? LATE_CANCEL_FEE_INR : 0;
}

export interface RescheduleInput { newSlotId?: string; reason?: string }

export function rescheduleAppointment(id: string, input: RescheduleInput): Appointment {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) throw new BookingError('NOT_FOUND', 404, 'Appointment not found.');
  if (!canReschedule(appt)) {
    throw new BookingError('RESCHEDULE_NOT_ALLOWED', 422, 'This appointment can no longer be rescheduled.');
  }
  const next = slots.find((s) => s.id === input.newSlotId);
  if (!next) throw new BookingError('SLOT_NOT_FOUND', 404, 'That slot does not exist.');
  if (next.providerId !== appt.providerId) {
    throw new BookingError('VALIDATION', 400, 'Choose a slot with the same provider.');
  }
  if (next.appointmentId) {
    throw new SlotUnavailableError(
      'Sorry, that time has just been booked by someone else. Please choose another time. Your current appointment has not changed.',
    );
  }
  const old = slots.find((s) => s.id === appt.slotId);
  if (old) old.appointmentId = null;
  next.appointmentId = appt.id;
  appt.slotId = next.id;
  if (input.reason) appt.note = input.reason;
  return appt;
}

export interface CancelInput { cancellationReason?: string; reason?: string }

export function cancelWithPolicy(id: string, input: CancelInput = {}): Appointment {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) throw new BookingError('NOT_FOUND', 404, 'Appointment not found.');
  const reason = normaliseReason(input.cancellationReason);
  const fee = appt.status === 'BOOKED' ? feeFor(appt, reason) : 0;
  cancelAppointment(id);
  appt.cancellationReason = reason;
  appt.feeInr = fee;
  if (input.reason) appt.note = input.reason;
  return appt;
}
