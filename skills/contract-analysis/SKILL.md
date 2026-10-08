---
name: contract-analysis
description: Pair OpenAPI constraint candidates (pattern, enum, min/max, required, documented error responses) with the code that serves the same route, producing States and spec-vs-implementation mismatches. Use when diff.json lists a changed OpenAPI or Swagger file.
---

# Contract analysis

Loads only when `diff.json.contractFiles` is non-empty. Works on the
candidates with `source: "contract"` — each has `route`, `field`, `rule`
— together with the `source: "code"` candidates and `ui.json.routes`.

Each contract candidate's `rule` is a clean, composed, sentence-ready form
of the constraint — `pattern: ^[A-Z0-9]{6,12}$`, `enum: BOGO, PERCENTAGE,
FIXED`, `minimum: 1`, `required: field1, field2`, `response 422: <the
documented description>`. Read `rule` (and `field`) to work out what the
constraint means and to derive boundary values. Its `excerpt` is a
separate, honest slice of the actual contract file, kept only for citation:
depending on how that file is written it may carry quotes, `[...]`/`{...}`
punctuation, or span several lines (a block-style YAML list, for instance).
Never clean it up, never quote it as though it were prose, and never read
it in place of `rule` to work out what the constraint means.

## For each contract candidate

1. **Find the handler.** Match `candidate.route` against `ui.json.routes`
   by method and path (a route path may carry a mount prefix; match on the
   suffix). Note that route's `reach` — the files it can execute.
2. **Look for enforcement in code.** Among `source: "code"` candidates whose
   `file` is in `reach`, is there a `condition` or `throw` that checks the
   same thing?
   - `pattern` / `minLength` / `maxLength` → a condition testing the field's
     length or format.
   - `enum` → a condition or `case` per member.
   - `minimum` / `maximum` → a numeric comparison on that field.
   - `required` → a check for absence.
   - `response NNN: …` → a `throw` or call with `status: NNN`.

**Caution on unparsed files:** If `candidates.json.unparsed` names a file in `reach` and your lookup finds no enforcing code, that proves nothing was found, not that nothing exists. Do not record a `blocker` mismatch claiming the contract is unforced. Instead, raise it as a `question` mismatch that names the unread file inside `codeSays` (e.g. "no enforcing check found; src/x.ts could not be read"), so the dev can investigate once the file is readable. `MismatchSchema` has no `evidence` field — a file path only survives if it's in `codeSays` prose (the prose check's `FILE_REF` pattern in `scripts/lib/prose.ts` exempts file citations, so this doesn't trip the code-identifier check).

3. **Write the result.**
   - Enforced → one State, `origins` = the contract candidate **and** the
     enforcing code candidate. Boundary inputs come from the rule: a
     `pattern ^[A-Z0-9]{6,12}$` yields States for length 5, length 13, and
     lowercase input.
   - Declared but not enforced → the same State (it is still testable — the
     test will fail, which is the point) **plus** a mismatch:
     `claimSays`: the rule in words; `codeSays`: "nothing checks this before
     the request is processed"; `origins`: the contract candidate plus the
     nearest code candidate on that route (the first guard in the handler),
     `severity: blocker`.
   - Documented error response with no `throw`/call carrying that status in
     `reach` → mismatch. If a `throw` without a status exists on that path,
     cite it and say the failure is generic (a 500) rather than the
     documented response. An unhandled throw is not a mapping.
4. **Component schemas.** Contract candidates without a `route` come from a
   changed schema (e.g. `Coupon.discountType`). Treat enum members as in the
   feature-comprehension skill: a member no code condition or surface element
   can select becomes an `unreachable`, `confidence: low` State — reported
   as a question, never generated.

## `contractChanges`

Validator-owned (M1 ruling): `validate.ts` copies `candidates.json.contractChanges`
into `analysis.json.contractChanges` itself. Leave it out of what you write —
do not transcribe it yourself.

## Language

"The contract requires codes of 6–12 uppercase letters or digits" — not
`pattern: ^[A-Z0-9]{6,12}$` on its own, though quoting the pattern from
`rule` in parentheses after the sentence is fine. Status codes are data: "a
422 response" is correct tester language.
