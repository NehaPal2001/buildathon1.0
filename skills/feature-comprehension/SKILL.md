---
name: feature-comprehension
description: Turn Recon's extracted candidates (conditions, throws, enums, defaults, contract constraints) into behaviour changes, testable States with reachability, and claim mismatches, written to .recon/analysis.json. Use when analysing a branch for what changed and what needs testing.
---

# Feature comprehension

You are given facts, not source. Work only from these files in the app
repo's `.recon/raw/`:

- `diff.json` — branch, base, changed files, commit messages
- `candidates.json` — every conditional / throw / enum / default / contract
  constraint in the changed hunks, each with `id`, `kind` (`condition` |
  `throw` | `enum` | `default` | `constraint`), `file`, `line`, `excerpt`,
  `context`, `enclosingFunction`, `identifiers`, `source` (`code` |
  `contract`), optional `route`, `status` (a `throw` candidate's literal
  HTTP status, if any), and `field`/`rule` for `constraint` candidates (see
  the contract-analysis skill)
- `ui.json` — Express routes (`method`, `path`, `file`, `reach`) and the
  HTML surface (`element`, `attrs`, enclosing `form` action)
- the claim text (ticket file, or the commit messages, or nothing)

**Do not open application source.** If a candidate's `context` is not
enough to judge it, say so in a `question` mismatch; do not read the file.

## What to produce

Write `.recon/analysis.json` matching this shape (`version: 2`). Leave
`coveredBy: []` and omit `scope` unless the command tells you the suite
facts are available.

```json
{
  "version": 2, "branch": "…", "base": "…", "generatedAt": "<ISO now>",
  "candidatesTotal": 0, "claim": { "source": "ticket|commits|none", "text": "…" },
  "behaviourChanges": [{ "statement": "…", "origins": [{ "candidateId": "c-7", "file": "", "line": 0, "excerpt": "", "source": "code" }] }],
  "mismatches": [{ "claimSays": "…", "codeSays": "…", "origins": [ … ], "severity": "blocker|question" }],
  "states": [{
    "id": "kebab-slug", "description": "…", "origins": [ … ],
    "reachability": { "kind": "ui", "steps": ["Open checkout", "Enter SAVE20", "Apply"], "evidence": "input data-testid=coupon-input in form POST /api/cart/coupon" },
    "inClaim": false, "coveredBy": [], "confidence": "high"
  }]
}
```

Origins: only `candidateId` matters — the validator fills `file`, `line`,
`excerpt`, `source` from the candidate. Put placeholders in those fields.

`candidatesTotal`, `suppressed`, `exclusions`, `unparsed` and `contractChanges`
belong to the validator, not to you — it recomputes all five from the raw
fact files and from `.recon/conventions.md`'s Exclusions section on every
run, overwriting whatever is here. Leave `candidatesTotal: 0`, `suppressed: 0`,
and omit `exclusions`/`unparsed`/`contractChanges` entirely rather than
guessing at them.

## Method

### 1. Group candidates into States
A State is one testable situation, not one line. Walk the candidates file
by file and ask, for each: *what situation does this produce for a user or
API caller?*

- Several conditions guarding one outcome → **one** State listing every
  contributing `candidateId` in `origins`.
- A `throw` with a `status` → the error state for that input.
- A `throw` without a `status` inside a request path → a State whose
  description says the user gets a generic failure (a 500), not a message.
- An `enum` → one State per member **that some condition or surface element
  can select**. Members nothing selects → one `unreachable` State for the
  member, `confidence: low`.
- A `default` (normalising call, `??`, `||`, default parameter) → the State
  where the input was absent or in the "wrong" form and still accepted.
- A `constraint` from the contract → see the contract-analysis skill.
- Template conditionals that only change wording (`empty ? '' : '<p>…'`)
  are usually part of a State you already have; do not make a State per
  template branch.

Skip candidates that cannot affect anything observable (pure logging,
telemetry). If an Exclusions rule of the form "ignore states whose origin
is …" applies, still write the State but add `exclusionNote: "<the rule>"`
so the validator can count it.

### 2. Decide reachability by lookup
Check `ui.json` in this order and quote the fact you used in `evidence`:

1. `ui` — a `surface` element (input/button/link) can drive the condition.
   Its enclosing `form.action` should be a route whose `reach` contains the
   candidate's file. Steps are click-level and must name the literal input
   (`SAVE20`, `₹499`).
2. `api` — no surface element, but a route in `routes` whose `reach`
   contains the candidate's file. `setup` is the request in one line.
3. `data` — depends on stored state nothing in the surface or routes sets
   (e.g. a previously used coupon). `setup` says what to seed.
4. `unreachable` — none of the above. `why` says what is missing.

If `ui.json.routes` is empty (no route table could be extracted), do not
mark anything `unreachable` on that basis: use `api` with
`evidence: "no route table found"` and say so in a question for the dev.
The same caution applies when `ui.json.unparsed` or `candidates.json.unparsed`
names the very file you'd need to check: an empty result there proves
nothing was found, not that nothing exists — use `api` or `data` with
`evidence` naming the file that could not be read, and raise a question
instead of declaring `unreachable`.

### 3. Compare with the claim
For each State, search the claim text for a phrase that describes it. If
found, `inClaim: true` and quote it verbatim in `claimFragment`. Otherwise
`inClaim: false`.

A **mismatch** needs two things you can quote: a claim fragment, and a
candidate excerpt that contradicts it. Typical shapes:

- claim promises a rule, no candidate enforces it ("one coupon per order"
  vs. guards that check existence, expiry and minimum but never
  "already applied") → cite the guards that *do* exist as origins, and say
  the missing check in `codeSays`.
- claim says X, code does Y (exact-match vs. uppercased).

`severity`: `blocker` if `claim.source` is `ticket`, `question` if
`commits`. With `none`, produce no mismatches.

### 4. Write behaviour changes
One statement per State group, user-visible, in tester language, citing
the group's origins. Three to eight statements is typical; never one per
candidate.

### 5. Confidence
- `high` — condition and its outcome are both inside the changed hunks
  (the candidate's `context` shows both).
- `medium` — condition is in the diff, outcome is elsewhere.
- `low` — inferred from a `default` or an `enum` member with no condition
  using it.

## Checklist before handing to the validator

- [ ] Every `origins[]` entry has a `candidateId` that exists in
      `candidates.json`.
- [ ] No State was written without a candidate. No candidate was turned
      into more than one State unless it truly produces two situations.
- [ ] Every `ui` reachability has an `evidence` naming a surface element.
- [ ] Every `inClaim: true` has a verbatim `claimFragment`.
- [ ] `unreachable` states have `confidence` ≤ `medium`.
- [ ] Prose passes the tester-language rules — including every
      `reachability.evidence`, not just `description` and `steps`.
