# BUILD.md — implementation brief for Recon

Companion to PRODUCT.md. That doc argues *why*. This one specifies *what to
make*. Where they disagree, this file wins on mechanics and PRODUCT.md wins
on intent.

**Read PRODUCT.md first.** Do not start coding from this file alone.

---

## 0. Non-goals — do not build these

An implementing agent will be tempted. Don't.

- No web UI, no dashboard, no server. Terminal output only.
- No database. Filesystem and git are the only state.
- No writes to application code, ever. Read-only against app source.
- No test *execution* in v1. Recon analyses and generates; the tester runs.
- No multi-framework support. Playwright + TypeScript only.
- No LLM calls for anything deterministic. If git or a schema can answer it,
  parse it — don't ask a model. Models are for translating code into tester
  language, nothing else.
- No config file until something actually needs configuring.

## 1. Core abstraction: a State

Everything hinges on this. Define it once, use it everywhere.

A **State** is one testable situation the changed code can produce.

```ts
type Reachability =
  | { kind: 'ui';   steps: string[] }        // clickable path exists
  | { kind: 'api';  setup: string }          // needs a request to reach
  | { kind: 'data'; setup: string }          // needs seeded data
  | { kind: 'unreachable'; why: string };    // dead code / flag-gated

interface State {
  id: string;                  // stable slug, e.g. 'coupon-below-minimum'
  description: string;         // tester language, no code identifiers
  origin: {                    // WHY we believe this state exists
    file: string;
    line: number;
    excerpt: string;           // the conditional/constraint that implies it
    source: 'code' | 'contract';
  };
  reachability: Reachability;
  inClaim: boolean;            // mentioned in ticket / commit messages?
  coveredBy: string[];         // existing spec paths, [] if uncovered
  confidence: 'high' | 'medium' | 'low';
}
```

Rules:

- **Every State carries an origin.** No origin, no State. This is the
  anti-hallucination rule and it is not optional.
- `confidence: 'low'` states are reported but never auto-generated into specs.
- `unreachable` states are reported as questions for the dev, never as tests.
- A State is *testable*, not *a line of code*. Three conditionals guarding one
  outcome are one State.

## 2. Output contract

The analysis writes `.recon/analysis.json` before anything renders. The
renderer and the generator both read that file. Never render straight from
in-memory analysis — the artifact is what makes runs reproducible and
debuggable.

```ts
interface Analysis {
  version: 1;
  branch: string;
  base: string;                    // resolved merge-base
  generatedAt: string;             // ISO
  claim: {
    source: 'ticket' | 'commits' | 'none';
    text: string;
  };
  behaviourChanges: {              // user-visible statements only
    statement: string;
    origin: State['origin'];
  }[];
  mismatches: {                    // claim vs code disagreements
    claimSays: string;
    codeSays: string;
    origin: State['origin'];
    severity: 'blocker' | 'question';
  }[];
  states: State[];
  contractChanges?: {              // only if an OpenAPI file changed
    path: string;
    method: string;
    change: string;
    constraint?: { field: string; rule: string };
  }[];
  scope: {                         // the closing verdict — see PRODUCT.md
    totalTests: number;
    inScope: { spec: string; reason: string }[];
    outOfScope: { spec: string; reason: string }[];
    newTests: number;              // uncovered states to be generated
  };
}
```

### Rendering

Two destinations, same content:

1. terminal, on every run
2. `.recon/<YYYY-MM-DD>-<branch-slug>.md`, written every run

The markdown file is what the tester pastes to a dev, so it must stand alone:
no ANSI codes, no "see above", full findings with citations.

**Section order is fixed and ends with scope.** Comprehension leads, the scope
verdict closes. Never print scope first or interleave the two.

## 3. Build order

Each milestone must run end to end before the next one starts.

### M1 — diff → behaviour changes
`git merge-base`, then the diff. Filter to files that can affect behaviour.
Emit `behaviourChanges` with origins. Render to terminal.

**Done when:** running against the dummy repo prints ≥3 behaviour statements,
each citing a real file and line, and none of them mention a class or function
name.

### M2 — states + claim comparison
Enumerate States from conditionals and contract constraints. Pull the claim
from ticket arg, else commit messages. Mark `inClaim`. Detect mismatches.

**Done when:** the dummy repo yields the 4 planted findings (§5) and
`analysis.json` validates against the schema above.

### M3 — coverage cross-reference AND regression scope
Two jobs, same pass.

*Coverage:* parse the Playwright suite, map specs to States, populate
`coveredBy`.

*Scope:* classify **every test in the suite**, not just those touching the
changed feature. For each spec, decide whether it has any path to the changed
code — via the routes it exercises, the page objects it imports, the fixtures
it uses. Every classification carries a reason string; an exclusion without a
reason is not shippable, because "trust me, skip these 293" is exactly what a
tester won't do.

Bias: when a spec's relation to the change is uncertain, put it **in** scope.
Wrongly including a test costs minutes. Wrongly excluding one ships a bug.

**Done when:** the planted happy-path specs match their States; no uncovered
State is falsely marked covered (false "covered" is the worst bug here — it
hides work, so prefer false "uncovered"); and every spec in the dummy suite
has a scope classification with a human-readable reason.

### M4 — spec generation
Extract suite conventions first (§4). Generate specs for approved States.

**Done when:** a generated spec imports the repo's existing page object,
calls its methods, uses no inline locators, and passes `tsc --noEmit`.

### M5 — probe (optional, only if M1–M4 are solid)
Schema constraints → boundary requests → compare to documented responses.
Read-only methods only (GET/HEAD) unless explicitly flagged.

## 4. Convention extraction

Before generating anything, scan the test repo and record:

- page object location, naming, and export style
- how a page object is obtained in a test (fixture? constructor? helper?)
- locator strategy actually in use, ranked by frequency
- assertion style (`expect(x).toBeVisible()` vs custom matchers)
- file naming and describe/test block phrasing
- how auth/setup is handled (storageState? fixture? beforeEach?)

Write to `.recon/conventions.md`, human-readable and editable. Generated specs
must conform to this file, not to Playwright's defaults. **The repo wins over
best practice.** A spec that's idiomatic-but-foreign gets rewritten by the
tester, which means the tool saved nothing.

The same file carries the tester's corrections — this is the only feedback
mechanism in v1, and it is deliberately manual:

```markdown
## Exclusions
- ignore states from src/legacy/**
- ignore states whose origin is a logging or telemetry branch
- treat src/shared/money.ts as always in regression scope
```

Read exclusions on every run, apply before rendering, and say how many states
were suppressed so they can't silently disappear. Regenerate the conventions
section when the suite changes, but **never overwrite the Exclusions section**
— it's hand-written.

## 5. Dummy repo spec

Build at `fixtures/demo-shop/`. It exists to prove the mechanism and to drive
the demo, so the findings are planted deliberately.

**App:** Express + TypeScript, in-memory store, minimal HTML checkout page.
No database, no auth provider, starts with one command.

**Baseline branch `main`:** working cart and checkout, no coupons.

**Feature branch `feature/PROJ-4821`:** coupon support, with exactly four
planted findings:

1. **Spec/implementation mismatch** — commit message and ticket both say "one
   coupon per order"; `applyCoupon` has no uniqueness guard, so codes stack.
2. **Unenforced constraint** — OpenAPI declares
   `pattern: ^[A-Z0-9]{6,12}$`; the handler never validates, accepts `abc`.
3. **Documented-but-missing error path** — spec documents
   `422 CART_BELOW_MINIMUM`; code throws an unhandled error → 500.
4. **Enum value with no UI path** — `discountType` enum includes `BOGO`;
   nothing in the UI can produce it.

**Ticket** at `fixtures/PROJ-4821.md`: deliberately three lines, mentioning
only percent/flat discounts and "invalid codes show an error."

**Existing suite:** POM-based, `pages/CheckoutPage.ts` with real methods,
three specs covering only valid-percent, valid-flat, invalid-code. This must
look like a suite someone actually maintains — inline locators here would make
M4's output look bad through no fault of the generator.

## 6. Plugin packaging

```
recon/
  .claude-plugin/
    plugin.json
    marketplace.json          # so install is one line in the demo
  commands/
    cover.md
    probe.md
  skills/
    feature-comprehension/SKILL.md
    suite-conventions/SKILL.md
    contract-analysis/SKILL.md
    tester-language/SKILL.md
  scripts/
    analyse.ts
    diff-contract.ts
    probe.ts
  fixtures/demo-shop/
```

Skill frontmatter — description decides when it loads, so write it for a
matcher, not for a human:

```markdown
---
name: feature-comprehension
description: Translate a code diff into testable states in tester language.
  Use when analysing a branch for what changed and what needs testing.
---
```

## 7. Tech decisions

Settled, so the agent doesn't deliberate:

- TypeScript, Node 20+, run via `tsx`. No build step.
- `simple-git` or plain `git` via child_process — either, but pick one.
- OpenAPI parsing: `@apidevtools/swagger-parser` to dereference, then compare
  plain objects. No dedicated diff library.
- Playwright suite parsing: TypeScript compiler API, not regex.
- Terminal rendering: plain string building. No CLI framework, no colour
  library unless output is genuinely unreadable without it.
- Zod for validating `analysis.json` against its schema at read and write.

## 8. Self-verification

Before declaring a milestone done, the agent must:

1. Run the command against `fixtures/demo-shop/` and read the actual output.
2. Check every State's origin against the real file and line — open them.
3. Confirm no output text contains a class, method, or variable name.
4. For M3+, confirm no uncovered State is marked covered.

Do not report a milestone complete on the basis that the code compiles.

## 9. Language rules for all output

Enforced by the `tester-language` skill, and the main thing that makes this
feel like a tool for testers rather than a diff viewer.

- No code identifiers in prose. Not `CouponService.apply()` — "applying a
  coupon".
- Every claim cites file and line, or it doesn't get said.
- State confidence explicitly, and never assert beyond it.
- When the claim source is commit messages rather than a ticket, soften
  accordingly: "not implied by the commit messages", not "not in the ticket".
- Never say a state is untested when it means unmatched. Say what was checked.
