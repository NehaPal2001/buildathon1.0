# Recon — feature intelligence for automation testers

*Working name for the plugin. The command is `/cover`.*

**One line:** Recon reads the code a tester can't read, works out what the
feature actually does, and writes the Playwright tests for the states
nobody mentioned.

---

## The problem

An automation tester is handed a ticket:

> PROJ-4821 — Add coupon code support
> Users can apply one coupon at checkout. Percentage and flat discounts.
> Invalid codes show an error.

Three lines. Maybe a Loom. Then they're expected to find the bugs.

Everything that determines what is testable — validation rules, error
branches, defaults, enum values, feature flags, the thing the dev changed
in passing and never mentioned — lives in the diff. In a language and a
workflow that isn't theirs. Testers don't review PRs. They see a feature,
not code.

So they write tests for what the ticket describes — four happy paths — and
find out in production that expired coupons return a 500.

**The bottleneck is not writing tests. It is knowing which tests to write.**
Every existing AI testing tool automates the part testers are already good
at and ignores the part that actually limits them.

## Who it's for

Automation testers and SDETs on teams where:
- tickets are thin and testing notes are thinner
- the tester has read access to the app repo but never opens it
- there's an existing Playwright suite they own
- there's usually an API contract at the integration boundary

Not for: developers writing their own tests, teams with no suite yet.

## The positioning

**Every generator writes tests from the ticket or the UI, so it produces
the four paths that were already obvious. Recon writes tests from the code,
so it produces eleven — including the seven nobody mentioned.**

Comprehension leads. But it has to *land somewhere*, because the research is
blunt about the binding constraint: ~48% of QA professionals name lack of
time as the primary obstacle to automation — not tools, not skills. A tool
that adds an activity loses, however insightful it is.

So every run ends in one number, and that number is scope:

> **47 of your 340 regression tests are in scope for this release.
> Here's why the other 293 are not.**

The brief is the argument; the scope verdict is the payoff. Order matters —
understanding first, then the hours it gives back. Never two headlines side
by side: the brief builds to the verdict and stops there.

This has a real build implication. Scope reduction needs the **whole suite**
mapped against the change, not only the states of the changed feature.
See BUILD.md §3 M3.

## Why nobody has built this

**Commercial self-healing platforms** (Testsigma, mabl, Testim, Functionize,
Applitools) patch locators at runtime. Their own reviewers name the flaw:
healing masks real bugs, can't touch ~22% of failures, and does nothing for
assertion correctness. They optimise for a green dashboard.

**AI test generators** — including the existing Claude Code skills
(`playwright-test-fixer`, `playwright-pro-fix`, the multi-agent generation
pipelines) — write from a prompt or by crawling the UI. Both are blind to
branches: they test what is *visible*.

Nobody reads the implementation to decide **what is worth testing**. That
position is open because it requires taking the tester's side rather than
replacing them.

## How it works

### Sources, and the disagreements between them

| Source | Required | What it tells you |
|---|---|---|
| App repo diff (read-only) | **yes** | what **actually** changed |
| API contract diff (git) | if one exists | what changed at the **observable boundary** |
| Existing test suite | yes | what the suite already believes |
| Ticket text | no | what the team **claims** changed |
| Staging API | probe only | what the system **really does** |

**Branch is the only required input.** Without a ticket you still get
behaviour changes, reachable states, contract diff, coverage gaps and
generated specs — everything except the word "unmentioned." A ticket adds
the claim side and unlocks the mismatch findings.

A ticket alone is worthless: claims with nothing to check them against.
Generating scenarios from acceptance criteria is what every existing tool
already does.

With no ticket, **commit messages and the PR title are the fallback claim
source** — "commit says *prevent duplicate coupons*, code has no uniqueness
guard" is the same finding shape, for free, from git. The output language
must be softer for these, since a commit message is a weaker claim than a
ticket.

`/cover PROJ-4821` also works: it resolves via `git branch --list
"*PROJ-4821*"`. That's a branch lookup, not an alternate data source. Zero
or multiple matches → it asks.

### The loop

```
branch  (+ optional ticket text)
      ↓
 [ comprehend ]   diff → user-visible behaviour, not "refactored CouponService"
      ↓
 [ enumerate  ]   every branch → a reachable state + how to reach it
      ↓
 [ compare    ]   states vs claim     → what was never mentioned
                  contract vs code    → spec/implementation mismatch
                  states vs suite     → coverage gaps
      ↓
 [ APPROVE    ]   tester trims the state list          ← human judgment
      ↓
 [ generate   ]   Playwright specs, conforming to repo conventions
      ↓
 [ SCOPE      ]   whole suite vs this change → in scope / out, with reasons
```

The approval gate is the point. The tester stays the author; the tool did
the reading they couldn't do.

### One command, gated actions

```
/cover feature/PROJ-4821

  [ brief: what changed · 11 states · 3 covered · 2 questions ]

  → 8 uncovered states. Generate specs? [a]ll / [s]elect / [n]o
  → 6 contract constraints are probeable. Probe staging? [y/N]
```

Everything read-only runs in one pass. The two things with real-world
effects — writing files, hitting a shared staging environment — are gated.
A command called "brief me" that silently fires 40 requests at a QA
environment during someone's regression run is how you lose trust once and
permanently.

### Sample output

```
COVER — feature/PROJ-4821 "Add coupon code support"
main → feature/PROJ-4821 · 6 files · api/openapi.yaml changed

WHAT ACTUALLY CHANGED
  · Coupon codes are case-insensitive. Ticket implies exact match.
  · Minimum cart value ₹500 enforced server-side. Not in ticket.
  · Discount stacking is permitted in code.

⚠ SPEC vs IMPLEMENTATION
  Ticket says "one coupon per order."
  CouponService.apply() has no uniqueness guard — two codes stack.
  → Confirm intent before testing. Either a bug, or a stale ticket.

REACHABLE STATES — 11 total · 4 in the ticket · 3 covered by suite
  STATE                   HOW TO REACH                COVERED  TICKET
  valid percent           SAVE20, cart ≥ ₹500         yes      yes
  valid flat              FLAT100, any cart           yes      yes
  invalid code            BADCODE                     yes      yes
  expired code            OLD2025                     no       no
  below minimum           SAVE20, cart ₹499           no       no
  already used            SAVE20, 2nd order           no       no
  two stacked             SAVE20 then FLAT100         no       no ⚠
  code length 5 / 13      boundary, from pattern      no       no
  lowercase input         pattern is uppercase-only   no       no
  BOGO discount type      ⚠ no UI path — API setup    no       no
  null cart total         ⚠ no UI path — API setup    no       no

QUESTIONS FOR THE DEV
  1. Is stacking intended? Code permits it, ticket forbids it.
  2. BOGO is in the enum with no UI path. In scope or dead code?
  3. When is cart total null, and what should the UI render?

  8 uncovered states. Generate specs? [a]ll / [s]elect / [n]o

REGRESSION SCOPE — 340 tests in suite
  47 in scope     touch cart totals, checkout, or the changed contract
  293 out         no path to the changed code
   + 8 new        the uncovered states above

  → written to .recon/2026-09-22-PROJ-4821.md
```

The last block is the one a tester screenshots. Everything above it is the
justification for trusting it.

### Generation rules

Three things decide whether the output is usable or gets rewritten:

**Conform to the repo, always.** Extract the suite's conventions first —
page objects, fixtures, locator strategy, naming, assertion style — and
generate against them. `CheckoutPage.applyCoupon('SAVE20')`, not an inline
`page.locator('.coupon-input')`. A spec that violates the framework is tech
debt with a passing test on top.

**Say when a state has no UI path.** BOGO and the null total can't be
reached by clicking. The tool must say so and supply the API setup, not
invent a click sequence that doesn't exist. Inventing is the fastest way to
lose the tester.

**Follow Playwright's locator priority** — `getByRole` > `getByLabel` >
`getByTestId` > CSS — unless the repo's own convention says otherwise. The
repo wins.

## What this is not

- Not self-healing. It will never make a failing test pass.
- Not a coverage metric tool.
- Not for developers. Every output is in tester language.
- Never writes to application code. Read-only against the app repo, always
  — that's what makes it safe to run on someone else's branch without a
  permissions conversation.

## Riskiest assumptions

Ordered by damage if wrong.

1. **The "unmentioned change" hit rate is high enough to matter.** If a
   typical PR surfaces one trivial omission, this is a novelty. The dummy
   repo will *not* settle this — its findings are planted. Must be tested
   against three real PRs before committing serious build time.

2. **Generated specs are good enough to keep.** If the tester rewrites
   every one, the tool saved nothing. Hinges entirely on convention
   conformance.

3. **Testers trust code-derived findings they can't verify.** Two wrong
   briefs and it's dead. Mitigation: every claim cites a file and line,
   confidence is explicit, and nothing is asserted without a citation.

4. **Read access to the app repo is real.** True in most orgs; unverified.
   Contract-only fallback works but is materially weaker.

5. **An API contract exists and is versioned in git.** Load-bearing for the
   probe. If specs live only behind a Swagger UI, the probe needs recorded
   HAR instead.

6. **Staging is safe to probe.** Read-only probes first; anything mutating
   is opt-in.

## v1 scope

1. **Comprehension + state enumeration** — diff → behaviour → reachable
   states, with coverage cross-reference. The engine.
2. **Spec generation** with convention conformance. The deliverable.
3. **`/probe`** — schema constraints → boundary requests → mismatch report.
   Separate command, finds bugs rather than writing tests.

1 and 2 are the submission. 3 is the second demo moment if time allows.

### Structure

```
recon/
  .claude-plugin/plugin.json
  commands/   cover.md
              probe.md
  skills/     feature-comprehension/   diff → behaviour → states
              suite-conventions/       extract + enforce repo patterns
              contract-analysis/       OpenAPI diff + constraint extraction
              tester-language/         house style: no code-speak, no overclaiming
  scripts/    diff-contract.ts
              probe.ts
```

Most of the intelligence is markdown — deliberately. A tester who can read
and fork the state-enumeration rules will trust them over a black box,
which is exactly the problem in assumption #3.

## Demo

Dummy repo, deliberately thin ticket, one command. Three moments:

1. **"Stacking is permitted in code but the ticket forbids it"** — a
   spec/implementation mismatch found before a test was written.
2. **"11 states, 3 covered"** — then generated specs for the gaps, using
   the repo's own page objects.
3. **"47 of 340 in scope"** — the number that turns a two-week regression
   into two days, with a reason attached to every exclusion.

Close on: *every other tool would have written you four tests and left you
to run the other three hundred.*

## Decisions taken

- **Output** — terminal, plus a dated markdown file written to `.recon/`.
  Diffable in git, shareable by paste, handed to a dev as-is. No ticket
  integration in v1.
- **Corrections** — `.recon/conventions.md` is hand-editable and carries
  exclusion rules (`ignore states from src/legacy/**`) alongside suite
  conventions. No learning loop in v1.
- **Framework** — Playwright and TypeScript throughout, no abstraction seam.
  Adding Cypress later is a rewrite; that's an accepted cost.
- **Headline** — comprehension leads, scope verdict closes. One number.

## Open questions

- Does the scope verdict need CI history to be credible, or is change impact
  alone enough? History would sharpen it and adds a dependency.
- What's the honest floor for suite size? Below ~50 tests, scope reduction
  saves nothing and the brief has to carry the whole value.

---

*Session notes: this replaced two earlier directions — a failure-triage
plugin, and a set of Playwright hygiene tools (timeout purge, locator
migration). Both were rejected for the same reason: they solved code
problems, not tester problems. The reframe that stuck: **the tester's
bottleneck is not writing tests, it's understanding the feature well enough
to know what to test.** The second reframe: the tests are still the
deliverable — comprehension is what makes them good.*
