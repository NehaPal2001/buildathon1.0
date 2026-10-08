---
name: tester-language
description: House style for every string Recon writes for testers — no code identifiers, every claim cited, confidence stated, claims softened when the source is commit messages. Use whenever writing analysis.json descriptions, statements, reasons, or generated spec titles.
---

# Tester language

Every string that lands in `.recon/analysis.json` or a generated spec title
is read by someone who does not open the code. Write for them.

## Rules

1. **No code identifiers.** Not `applyCoupon()`, not `CouponError`, not
   `MIN_CART`, not `res.status(422)`. Say what happens: "applying a coupon",
   "the server rejects it", "the minimum cart value", "a 422 response".
   Plain lowercase words that also happen to be variable names (`cart`,
   `coupon`, `total`) are fine. Literal values a tester types — `SAVE20`,
   `₹499`, `abc` — are data, not code, and belong in the text. The banned
   set is every `enclosingFunction` and `identifiers` entry across *all* of
   `candidates.json`, not only the candidates your finding cites — a
   variable name lifted from a candidate you never mention is still banned,
   so reach for a different word instead.
2. **Every claim cites.** A statement, mismatch or state without an origin
   candidate does not get written. If you cannot point at a line, drop it.
3. **State confidence, never exceed it.** `high`: the condition and its
   outcome are both in the diff. `medium`: the condition changed but the
   outcome is outside the diff. `low`: inferred from a default or an enum
   member nothing in the diff checks.
4. **Soften for commits.** When `claim.source` is `commits`, write "not
   implied by the commit messages", never "not in the ticket". When it is
   `none`, no finding may mention a claim at all.
5. **Unmatched ≠ untested.** Never say a state "is not tested". Say "no
   spec in the suite reaches it with this input" — and what was checked.
6. **Say how to reach it, or say it can't be.** Reachability steps are
   click-level ("Open checkout", "Enter SAVE20", "Apply"). For `api` and
   `data`, give the request or seed in one line. Never invent a click path;
   if the surface has no element for it, it is `unreachable`.

## Rewrite patterns (for validator failures)

| validator flags | write instead |
|---|---|
| `applyCoupon` | applying a coupon |
| `CouponError` / `throw new Error` | the server rejects it with an error / fails with a generic error |
| `rawCode.toUpperCase()` | the code is uppercased before lookup |
| `res.status(422)` | a 422 response |
| `MIN_CART`, `minCart` | the minimum cart value |
| `discountType` / `BOGO` enum | the discount type / a buy-one-get-one type |
| `expiresOn < today` | the coupon's expiry date has passed |

## Self-check before writing analysis.json

- Read every `description`, `statement`, `claimSays`, `codeSays`, `reason`,
  `steps[]`, `setup`, `why`, `evidence` aloud. Would a tester who has never
  seen the repo understand it? `evidence` is checked exactly like the rest —
  a fact quoted from `ui.json` still has to read as English, not as a data
  dump.
- Does every finding carry at least one `candidateId`?
- Does any sentence assert more than its confidence supports?
