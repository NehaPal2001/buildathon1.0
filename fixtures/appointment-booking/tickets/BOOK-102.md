BOOK-102 — Recurring weekly appointments

**Type:** Story | **Priority:** Medium | **Labels:** booking, patient-portal, retention, recurring-care

## Background / Problem

A large share of clinic visits are part of a course of care: physiotherapy sessions, follow-up consultations, counselling, dental treatment plans. Today a patient who needs the same provider at the same time every week has to go through the booking flow again for each visit. That is tedious for the patient, and every extra booking is a chance for them to drop off, leaving the treatment plan unfinished and the provider's calendar with gaps.

Clinics have asked for a way to book the whole series in one go. We are starting with the simplest, most common pattern: the same slot time, every week.

## User story

As a patient on a course of treatment, I want to book the same time slot every week in a single step, so that I do not have to repeat the booking flow for every visit and my schedule is secured.

## Detailed description

- The booking page gets a **Repeat** section, below the slot selection and patient details.
- The patient chooses to repeat the appointment **weekly** and sets the **number of occurrences**, from **2 to 8** (the first appointment counts as occurrence 1).
- The patient selects the first slot as usual. The following appointments are for the same provider, at the same time of day, exactly 7 days apart.
- If the patient does not turn on repeating, booking behaves exactly as it does today: one appointment.
- Each occurrence is a normal appointment. It appears separately in My Appointments and can be viewed and cancelled on its own.
- Booking is **all or nothing**. The system checks every occurrence. If any one of the slots is unavailable, **no** appointment in the series is booked, and the patient is told which date caused the problem so they can pick a different start time or fewer weeks.
- When the series is booked successfully, the confirmation page lists every appointment with its date and time.

### Example

A patient picks Dr. Rao on Tuesday 10:00 and chooses weekly, 4 occurrences. The system books Tuesday 10:00 for four consecutive weeks. If the third Tuesday is already taken, nothing is booked and the patient sees that the date of the third Tuesday is unavailable.

## Acceptance criteria

1. **Given** the booking page, **when** the patient views it, **then** a Repeat section with a weekly option and an occurrences field is shown.
2. **Given** weekly repeat with 3 occurrences and all slots free, **when** the patient submits, **then** three appointments are created, one week apart at the same time.
3. **Given** a successful series, **when** the confirmation page loads, **then** it lists every appointment with its date and time.
4. **Given** the patient has not turned on repeating, **when** they submit, **then** exactly one appointment is created and the confirmation looks as it does today.
5. **Given** the occurrences field, **when** the patient enters a number below 2 or above 8, **then** they are prevented from booking the series and told the allowed range.
6. **Given** weekly repeat where one of the later weeks' slots is already taken, **when** the patient submits, **then** no appointments are created from the series.
7. **Given** a series that failed for that reason, **when** the error is shown, **then** it names the date that is unavailable.
8. **Given** a successful series, **when** the patient opens My Appointments, **then** each occurrence is listed as its own appointment.

## Out of scope

- Any repeat pattern other than weekly.
- Editing or cancelling a whole series in one action.
- Choosing a different time on different weeks.
- Waitlists or automatic fallback to another provider.
- Reminders and notifications.

## UX notes

- Section heading: **Repeat this appointment**.
- Controls: a checkbox "Repeat weekly" and a field "Number of appointments (2 to 8)".
- Range error: "Please choose between 2 and 8 appointments."
- Conflict error: "We couldn't book your series because {date} is not available. No appointments were booked. Please choose a different time or fewer appointments."
- Confirmation heading for a series: "Your appointments are booked", followed by a list such as "1. Tue 14 Jul, 10:00".

## Dependencies

- Slot generation must have slots available far enough ahead (up to 8 weeks) for clinics that want to offer recurring bookings. Product to confirm the availability horizon with clinic ops.
- Design sign-off on the Repeat section layout.

## Open questions

- Should the patient be able to preview the series dates before submitting?
- Should we cap how many series a patient can have active at once?
- How should clinics be told that a series was booked as a group?
