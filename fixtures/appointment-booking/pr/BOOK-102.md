**Title:** BOOK-102: Let patients book recurring weekly appointments

**Branch:** `feature/BOOK-102-recurring` into `main`
**Ticket:** BOOK-102

## What changed

- The `/book` page has a new **Repeat** section: frequency and number of appointments.
- Submitting with repeat on creates the first appointment and the following weekly ones at the same time of day, one week apart.
- The confirmation page now lists every appointment that was created, with date and time.
- Booking without repeat works as before (single appointment, same confirmation).
- New `src/services/recurring.ts` and `src/routes/recurring.ts`; edits to `src/routes/book.ts` and the booking views.
- `api/openapi.yaml` updated with the repeat fields on the booking request and the series response.
- E2E: `BookingPage` page object extended, new `e2e/specs/recurring.spec.ts`.

## How to test locally

```
npm install
npm start                # http://localhost:3000
npx playwright test      # whole suite
npx playwright test e2e/specs/recurring.spec.ts
```

Manual: go to `/book`, choose a provider and slot, turn on Repeat, set 3 appointments and submit. The confirmation should show three dates one week apart. Check `/appointments` too.

## Tests

- Added 3 Playwright tests: weekly x3 happy path, single booking unchanged, summary lists all dates.
- Existing suite still passes locally.

## Screenshots

_TODO: add screenshots of the Repeat section and the series confirmation._

## Checklist

- [x] Ticket BOOK-102 linked
- [x] Tests added and passing locally
- [x] OpenAPI updated
- [ ] Screenshots attached
- [ ] Layout reviewed by design
- [ ] Reviewer assigned
