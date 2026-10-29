# Appointment booking: Recon fixture #2

A clinic appointment booking app (Express + TypeScript, in-memory store,
server-rendered HTML) with a Playwright suite, two independent feature
branches, and two Jira-style tickets. It is a second test subject for Recon,
in a different domain from `fixtures/demo-shop`.

## What's here

```
base/                 main: the app, api/openapi.yaml, 40 Playwright tests
feature-reschedule/   overlay for feature/BOOK-101-reschedule-cancel
feature-recurring/    overlay for feature/BOOK-102-recurring
tickets/              BOOK-101.md, BOOK-102.md  (paste into Jira)
pr/                   BOOK-101.md, BOOK-102.md  (PR title + description)
setup.sh / setup.ps1  build the git repo (Mac/Linux, Windows)
```

## Build the repo

```bash
bash fixtures/appointment-booking/setup.sh /tmp/booking-demo     # macOS / Linux / Git Bash
.\fixtures\appointment-booking\setup.ps1 "$env:TEMP\booking-demo"  # Windows PowerShell
```

You get a git repo with three branches. Both feature branches are one commit
off the same `main` commit, and neither contains the other:

```
main
feature/BOOK-101-reschedule-cancel
feature/BOOK-102-recurring
```

## Run the app and the tests

```bash
cd /tmp/booking-demo
npm install
npx playwright install chromium
npm start                      # http://localhost:3000   (PORT env to change)
npx playwright test            # 40 on main, 43 on each feature branch
```

The clock is frozen with `FAKE_NOW` (an ISO timestamp) so time rules are
testable. `POST /api/test/reset` reseeds the data. The suite runs with one
worker because the store is shared and reset per test.

Pages: `/` services, `/providers` (search), `/book`, `/appointments`,
`/appointments/:id`, `/account`. Each is backed by `/api/*` routes described
in `api/openapi.yaml`.

## Try Recon on it

```bash
cd /tmp/booking-demo
claude --plugin-dir /path/to/recon
```

```
/recon:cover BOOK-101 --ticket /path/to/recon/fixtures/appointment-booking/tickets/BOOK-101.md
/recon:cover BOOK-102 --ticket /path/to/recon/fixtures/appointment-booking/tickets/BOOK-102.md
```

Run each once without `--ticket` too, to see the commit-message fallback.

## Planted findings (for the maintainer; the tickets never mention these)

### BOOK-101: reschedule and late-cancellation fee

| # | Finding | Where |
|---|---|---|
| 1 | Ticket says reschedule once. The code has no counter, so it can be repeated. | `src/services/reschedule.ts` |
| 2 | Contract declares `maxLength: 200` on `reason` and a pattern `^slot_[0-9]{4}$` on `newSlotId`. Neither is enforced. | `api/openapi.yaml`, service |
| 3 | Contract documents `409 SLOT_TAKEN`. The service throws a plain error, so a taken slot returns 500. | `src/routes/reschedule.ts` |
| 4 | `PROVIDER_UNAVAILABLE` is a valid cancellation reason with no UI path. In code it waives the fee, which the ticket never says. | enum in contract and `src/types.ts` |
| 5 | Reasons are trimmed and uppercased, with a `default:` fallback (non-finding candidate). | `src/services/reschedule.ts` |
| 6 | Exactly 24 hours is free to cancel and still reschedulable (a boundary state). | `src/services/reschedule.ts` |

### BOOK-102: recurring weekly appointments

| # | Finding | Where |
|---|---|---|
| 1 | Ticket says all or nothing. The code books the available occurrences and skips conflicting ones. | `src/services/recurring.ts` |
| 2 | Contract says `minimum: 2, maximum: 8`. Only the maximum is enforced, so 1 and 0 are accepted via the API. | `api/openapi.yaml`, service |
| 3 | Contract documents `422 OCCURRENCE_CONFLICT`. If the first slot is taken the code crashes with a 500. | `src/routes/recurring.ts` |
| 4 | `BIWEEKLY` and `MONTHLY` work through the API only. The UI offers weekly. | enum in contract, service |
| 5 | `frequency` defaults to `WEEKLY` when omitted (non-finding candidate). | `src/services/recurring.ts` |

### Regression suite

`smoke.spec.ts` navigates through `helpers/nav.ts`, so Recon marks it
unresolved. Every other spec uses page objects with fixed routes and
resolves. That keeps the scope verdict meaningful: the changed app files are
few, so most specs should come out of scope.

Page objects navigate with literal routes on purpose. A dynamic address
like `/appointments/${id}` would mark the page object, and every spec that
uses it, as unresolved.

## Notes

- Node 22.12+ and npm. Works on macOS and Windows.
- `node_modules`, `test-results` and `playwright-report` are git-ignored.
