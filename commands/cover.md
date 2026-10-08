---
description: Brief a tester on a branch — what changed, every testable state, what the ticket never mentioned, coverage gaps, and regression scope. Then optionally generate Playwright specs.
argument-hint: <branch | ticket-id> [--ticket <file|text>] [--suite <dir>]
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---

# /cover — Recon brief

Arguments: `$ARGUMENTS`. Plugin root: `${CLAUDE_PLUGIN_ROOT}`. Working
directory is the app repo. Everything you produce goes under `.recon/` in
the working directory. **Never modify application source.**

## 0. Preflight

- If `${CLAUDE_PLUGIN_ROOT}/node_modules` does not exist, run
  `npm install --prefix "${CLAUDE_PLUGIN_ROOT}" --silent` once.
- Parse the arguments: the first non-flag token is the branch or ticket id;
  `--ticket <value>`; `--suite <dir>`. If no branch token, ask for one with
  AskUserQuestion and stop.

## 1. Extract (deterministic)

Run:
```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/extract-all.sh" "$PWD" "<branch>" [<suite>]
```
- If it fails with `Ambiguous branch "<query>": <a>, <b>, …` or
  `No branch matches "<query>"`, show the candidate list from stderr, ask
  the user which branch with AskUserQuestion, and re-run with the exact
  name.
- On success, `.recon/raw/diff.json`, `candidates.json`, `ui.json`, and,
  if a suite was found, `suite.json` and `.recon/conventions.md` exist.

## 2. Gather the claim

- `--ticket` given: if the value is an existing file, read it; otherwise
  treat the value as the ticket text. `claim.source = "ticket"`.
- Otherwise, if `diff.json.commits` is non-empty: `claim.source =
  "commits"`, `claim.text` = subjects and bodies joined with blank lines.
- Otherwise `claim.source = "none"`, `claim.text = ""`.

## 3. Read the facts

Read, in this order: `.recon/raw/diff.json`, `.recon/raw/candidates.json`,
`.recon/raw/ui.json`, and the `## Exclusions` section of
`.recon/conventions.md` if present. Do **not** read files under `src/` or
anywhere else in the app — the raw files are the only inputs.

## 4. Comprehend → `.recon/analysis.json`

Apply the `feature-comprehension` skill, the `tester-language` skill, and —
only if `diff.json.contractFiles` is non-empty — the `contract-analysis`
skill. Write `.recon/analysis.json` with `version: 2`, `coveredBy: []` on
every state, and no `scope` key. Leave `candidatesTotal` at 0 — the
validator sets it — and set `generatedAt` to the current ISO timestamp.

## 5. Validate

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/node_modules/tsx/dist/cli.mjs" "${CLAUDE_PLUGIN_ROOT}/scripts/validate.ts" --analysis .recon/analysis.json --candidates .recon/raw/candidates.json --conventions .recon/conventions.md --ui .recon/raw/ui.json --suite .recon/raw/suite.json
```
`--conventions`, `--ui` and `--suite` each degrade safely when the file
behind them does not exist (no suite was found), so it is always safe to
pass all three.
- Exit 0: continue.
- Exit 1: stdout is a JSON list of `{ where, message }`. Fix exactly those
  entries in `analysis.json` (rewrite prose per the tester-language rewrite
  table; replace or drop unknown candidate ids) and re-run. At most **three**
  attempts. If it still fails, print the error list verbatim, say the brief
  was not written, and stop.

## 6. Render

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/node_modules/tsx/dist/cli.mjs" "${CLAUDE_PLUGIN_ROOT}/scripts/render.ts" --analysis .recon/analysis.json --out-dir .recon
```
Show the user the complete stdout, verbatim, in a code block. Do not
summarise it, reorder it, or add commentary above it. The last line names
the markdown file that was written.

Then render the same analysis as a single self-contained HTML page, for
handing to a QA audience that wants to sort and filter rather than read top
to bottom:
```
node "${CLAUDE_PLUGIN_ROOT}/node_modules/tsx/dist/cli.mjs" "${CLAUDE_PLUGIN_ROOT}/scripts/render-html.ts" --analysis .recon/analysis.json --out-dir .recon --evidence .recon/evidence
```
It prints the path it wrote; name that file on its own line after the brief.
`--evidence` is safe to pass unconditionally — the directory is optional and
contributes nothing when absent.

**The markdown brief above is the deliverable; this page is additive.** If
this command fails, say so in one line, name the markdown brief as the
output, and continue to step 7 — never discard a validated brief because a
second renderer failed.

## 7. Next steps

State in one line how many states are uncovered and that spec generation
arrives with a later milestone. (M3 replaces this section with coverage and
scope; M4 adds the approval gate and generation.)
