**Title:** BOOK-101: Add reschedule and 24h late-cancellation fee notice

**Branch:** `feature/BOOK-101-reschedule-cancel` into `main`
**Ticket:** BOOK-101

## What changed

- New **Reschedule** flow on the appointment detail page: pick another available slot, confirm, and the appointment moves while the old slot is released.
- Reschedule is only offered more than 24 hours before the appointment.
- Cancelling less than 24 hours before the appointment now shows a fee notice (flat ₹300) and asks the patient to confirm. Earlier cancellations stay free.
- Cancelling now records whether a fee applies on the appointment, and the detail page shows it.
- If the chosen new slot is already booked, the patient sees the "slot no longer available" message.
- New `src/services/reschedule.ts` and `src/routes/reschedule.ts`; edits to `src/routes/appointments.ts` and the appointment views.
- `api/openapi.yaml` updated with the reschedule endpoint and the cancel request body.
- E2E: `AppointmentDetailPage` page object extended, new `e2e/specs/reschedule.spec.ts`.

## How to test locally

```
npm install
npm start                # http://localhost:3000
npx playwright test      # whole suite
npx playwright test e2e/specs/reschedule.spec.ts
```

Manual: open an appointment more than a day out, click Reschedule and pick a new slot. Then use the clock override (set `FAKE_NOW` before `npm start`) to move to within 24 hours of an appointment and try cancelling.

## Tests

- Added 3 Playwright tests: reschedule happy path, cancel more than 24h ahead is free, cancel less than 24h ahead shows the fee.
- Existing suite still passes locally.

## Screenshots

_TODO: add before/after screenshots of the detail page and the fee notice._

## Checklist

- [x] Ticket BOOK-101 linked
- [x] Tests added and passing locally
- [x] OpenAPI updated
- [ ] Screenshots attached
- [ ] Copy reviewed by design
- [ ] Reviewer assigned
