BOOK-101 — Reschedule appointments and introduce a late-cancellation fee

**Type:** Story | **Priority:** High | **Labels:** appointments, patient-portal, no-shows, payments-policy

## Background / Problem

Clinics on the platform tell us the same thing in every onboarding call: the calendar churns. Today a patient who can no longer make their slot has exactly one option, which is to cancel and book again from scratch. Many never come back to rebook, so the clinic loses the visit. Others simply do not show up, and the provider sits idle for 30 minutes with no chance to refill the slot.

Two things would help. First, make it easy to move an appointment to another slot in one step, so patients keep their visit instead of dropping it. Second, discourage last-minute cancellations, which are the ones clinics cannot recover from, by introducing a small, clearly communicated fee.

## User story

As a patient with an upcoming appointment, I want to move it to a different time without cancelling and rebooking, so that I keep my visit with the same provider and do not lose my place.

As a clinic administrator, I want late cancellations to carry a small fee, so that patients give us enough notice to offer the slot to someone else.

## Detailed description

### Rescheduling

- The appointment detail page shows a **Reschedule** button for appointments that are upcoming and still eligible.
- Selecting it lets the patient pick a new slot from the same provider's available slots.
- On success the original slot is released back to the pool and the appointment shows the new date and time. The appointment keeps its reference number.
- An appointment can be rescheduled **once**. After that, the button is no longer offered; the patient can still cancel.
- Rescheduling is only possible **up to 24 hours before** the current appointment time. Inside that window the Reschedule button is not available.
- If the slot the patient chose has been taken by someone else in the meantime, the patient sees a clear error and stays on the page with their current appointment unchanged, so they can choose another slot.

### Cancellation and the late-cancellation fee

- Cancelling **less than 24 hours** before the appointment carries a flat fee of **₹300**.
- Cancelling at any earlier point stays free.
- Before the cancellation is confirmed, the patient is shown a notice that states the fee, and must confirm to continue.
- The fee is recorded against the cancelled appointment so the clinic can see it. Collecting payment is handled separately (see Out of scope).

## Acceptance criteria

1. **Given** an upcoming appointment more than 24 hours away that has not been rescheduled, **when** the patient opens its detail page, **then** a Reschedule button is visible.
2. **Given** the patient is rescheduling, **when** they choose an available slot and confirm, **then** the appointment shows the new date and time and the old slot becomes available again.
3. **Given** an appointment that has already been rescheduled once, **when** the patient opens its detail page, **then** they cannot reschedule it again.
4. **Given** an appointment starting in less than 24 hours, **when** the patient opens its detail page, **then** rescheduling is not offered.
5. **Given** the patient picks a new slot that another patient has just booked, **when** they confirm, **then** a clear message explains the slot is no longer available and the original appointment is unchanged.
6. **Given** an appointment more than 24 hours away, **when** the patient cancels, **then** no fee is shown and the cancellation completes at no charge.
7. **Given** an appointment less than 24 hours away, **when** the patient starts to cancel, **then** a notice states the ₹300 fee and the patient must confirm before the cancellation goes through.
8. **Given** a cancellation with a fee, **when** it completes, **then** the cancelled appointment shows that a ₹300 fee applies.

## Out of scope

- Collecting or refunding the fee through a payment provider.
- Clinic-configurable fee amounts or notice windows.
- Rescheduling to a different provider or service.
- Staff-initiated rescheduling from the admin tools.
- Notifications (email or SMS) about changes.

## UX notes

- Reschedule button label: **Reschedule appointment**.
- Slot taken error: "Sorry, that time has just been booked by someone else. Please choose another time. Your current appointment has not changed."
- Fee notice: "Cancelling less than 24 hours before your appointment costs ₹300. Do you want to cancel anyway?" Buttons: **Keep appointment** and **Cancel and accept fee**.
- After a free cancellation: "Your appointment has been cancelled."
- After a cancellation with a fee: "Your appointment has been cancelled. A ₹300 late-cancellation fee applies."

## Dependencies

- Existing slot availability and booking flow (no changes expected to how slots are created).
- Design sign-off on the fee notice wording.
- Clinic ops to confirm the ₹300 figure with the first pilot clinics.

## Open questions

- Should the patient see the fee on the appointments list as well as the detail page?
- Do we need to tell patients about the fee at booking time?
- Should the clinic be able to waive the fee manually later?
