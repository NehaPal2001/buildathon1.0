export interface Service { id: string; name: string; durationMin: number; priceInr: number }
export interface Provider { id: string; name: string; specialty: string; serviceIds: string[] }
export interface Slot { id: string; providerId: string; startsAt: string; appointmentId: string | null }
export interface Appointment {
  id: string;
  slotId: string;
  providerId: string;
  serviceId: string;
  patientName: string;
  phone: string;
  status: 'BOOKED' | 'CANCELLED';
  createdAt: string;
  cancellationReason?: 'PATIENT_REQUEST' | 'SCHEDULE_CONFLICT' | 'PROVIDER_UNAVAILABLE';
  feeInr?: number;
  note?: string;
}
export interface Profile { name: string; phone: string; email: string }
