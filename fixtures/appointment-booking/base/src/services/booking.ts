import { appointments, newAppointmentId, providers, services, slots } from '../store';
import { now } from '../clock';
import type { Appointment } from '../types';

export class BookingError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

export interface BookingInput { slotId?: string; serviceId?: string; name?: string; phone?: string }

export function bookAppointment(input: BookingInput): Appointment {
  const name = (input.name ?? '').trim();
  const phone = (input.phone ?? '').trim();
  if (!name || !phone) throw new BookingError('VALIDATION', 400, 'Name and phone are required.');
  const slot = slots.find((s) => s.id === input.slotId);
  if (!slot) throw new BookingError('SLOT_NOT_FOUND', 404, 'That slot does not exist.');
  const service = services.find((s) => s.id === input.serviceId);
  const provider = providers.find((p) => p.id === slot.providerId)!;
  if (!service || !provider.serviceIds.includes(service.id)) {
    throw new BookingError('VALIDATION', 400, 'Choose a service this provider offers.');
  }
  if (slot.appointmentId) throw new BookingError('SLOT_TAKEN', 409, 'That slot has just been taken. Please pick another.');
  const appt: Appointment = {
    id: newAppointmentId(),
    slotId: slot.id,
    providerId: provider.id,
    serviceId: service.id,
    patientName: name,
    phone,
    status: 'BOOKED',
    createdAt: now().toISOString(),
  };
  slot.appointmentId = appt.id;
  appointments.push(appt);
  return appt;
}

export function cancelAppointment(id: string): Appointment {
  const appt = appointments.find((a) => a.id === id);
  if (!appt) throw new BookingError('NOT_FOUND', 404, 'Appointment not found.');
  if (appt.status === 'CANCELLED') throw new BookingError('ALREADY_CANCELLED', 409, 'Appointment is already cancelled.');
  appt.status = 'CANCELLED';
  const slot = slots.find((s) => s.id === appt.slotId);
  if (slot) slot.appointmentId = null;
  return appt;
}
