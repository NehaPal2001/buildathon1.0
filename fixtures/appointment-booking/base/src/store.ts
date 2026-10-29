import type { Appointment, Profile, Provider, Service, Slot } from './types';
import { now } from './clock';

export const services: Service[] = [
  { id: 'svc_general', name: 'General consultation', durationMin: 30, priceInr: 500 },
  { id: 'svc_dental', name: 'Dental check-up', durationMin: 45, priceInr: 800 },
  { id: 'svc_skin', name: 'Skin consultation', durationMin: 30, priceInr: 700 },
  { id: 'svc_eye', name: 'Eye examination', durationMin: 20, priceInr: 600 },
];

export const providers: Provider[] = [
  { id: 'prov_1', name: 'Dr. Asha Rao', specialty: 'General Practice', serviceIds: ['svc_general'] },
  { id: 'prov_2', name: 'Dr. Vikram Shah', specialty: 'Dentistry', serviceIds: ['svc_dental'] },
  { id: 'prov_3', name: 'Dr. Meera Iyer', specialty: 'Dermatology', serviceIds: ['svc_skin'] },
  { id: 'prov_4', name: 'Dr. Rohan Mehta', specialty: 'Ophthalmology', serviceIds: ['svc_eye'] },
  { id: 'prov_5', name: 'Dr. Neha Kapoor', specialty: 'General Practice', serviceIds: ['svc_general', 'svc_skin'] },
];

export let slots: Slot[] = [];
export let appointments: Appointment[] = [];
export let profile: Profile = { name: '', phone: '', email: '' };
let nextApptNo = 1;

const HOURS = [9, 10, 11, 14, 15]; // UTC clinic hours

/** Reseed: 14 days of slots starting tomorrow (UTC), ids slot_0001.. ordered provider > day > hour. */
export function reset(): void {
  const base = now();
  const day0 = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  slots = [];
  let n = 1;
  for (const p of providers) {
    for (let d = 1; d <= 14; d++) {
      for (const h of HOURS) {
        slots.push({
          id: `slot_${String(n++).padStart(4, '0')}`,
          providerId: p.id,
          startsAt: new Date(day0 + d * 86400000 + h * 3600000).toISOString(),
          appointmentId: null,
        });
      }
    }
  }
  appointments = [];
  profile = { name: '', phone: '', email: '' };
  nextApptNo = 1;
}

export function newAppointmentId(): string {
  return `apt_${String(nextApptNo++).padStart(4, '0')}`;
}

reset();
