# Recon

A Claude Code plugin for automation testers. Recon reads the code you don't
have time to read, works out what a feature actually does, and tells you
which states to test, including the ones the ticket never mentioned.

```
/recon:cover feature/PROJ-4821 --ticket PROJ-4821.md
```

## Why

A tester gets a three-line ticket and is expected to find the bugs. The
things that decide what is testable (validation rules, error branches,
defaults, enum values, the change the dev made in passing) live in the
diff, which testers rarely open. So the tests cover what the ticket says,
and the expired-coupon 500 turns up in production.

The bottleneck isn't writing tests. It's knowing which tests to write.
Recon writes them from the code, not from the ticket or the UI.

## What it gives you

`/cover` writes a brief for a branch, both to the terminal and to
`.recon/<date>-<branch>.md`:

| Section | What's in it |
|---|---|
| **What actually changed** | User-visible behaviour changes, in tester language. Not "refactored CouponService". |
| **Spec vs implementation** | Places where the ticket, the API contract and the code disagree (for example, "one coupon per order", but the code lets two codes stack). |
| **Reachable states** | Every testable state, how to reach it, and whether the ticket mentions it. States with no UI path are flagged with the API setup needed, never an invented click path. |
| **Questions for the dev** | Things that need a human answer before you test. |
| **Exclusions** | What your own exclusion rules filtered out, and any rule Recon didn't recognise. |
| **Regression scope** | Which of your existing tests the change affects (coming in M3, see Status). |

Every finding cites a file and line. Each citation is checked by a
validator, not just by the prompt: if Claude names something the extractors
didn't find, the brief isn't written.

## Status

Built milestone by milestone. Each one runs end to end against the demo
fixture before the next starts.

| Milestone | What | State |
|---|---|---|
| M0 | Demo fixture (shop app + Playwright suite) | ✅ Done |
| M1 | Deterministic extractors: diff, candidates, UI surface, suite facts, conventions | ✅ Done |
| M2 | Comprehension: `/cover`, skills, validator, rendered brief | ✅ Done |
| M3 | Coverage and regression scope | Not started |
| M4 | Playwright spec generation, behind an approval gate | Not started |
| M5 | `/probe`: boundary requests against staging | Not started |

Today `/cover` stops after the brief. Coverage, scope and spec generation
arrive in M3 and M4.

**Known issue:** exclusion rules written as
`ignore states whose origin is …` can be rejected by the validator when
Claude writes the full rule sentence instead of just the part after "is".
A fix is pending.

## Requirements

- Claude Code
- Node.js 22.12+ or 24+, and npm
- Git
- The app repo checked out locally, with read access. Recon never writes to
  application code.
- Optional: a Playwright + TypeScript suite (found automatically under
  `e2e/`, `tests/` or `playwright/`, or passed with `--suite`), and an
  OpenAPI file in the repo.

## Install

This repo is its own plugin marketplace (`recon-marketplace`), so anyone
with access to the Git repo can install from it.

**In Claude Code**, from the terminal:

```
/plugin marketplace add NehaPal2001/1.0
/plugin install recon@recon-marketplace
```

Or from a shell, with no session open:

```bash
claude plugin marketplace add NehaPal2001/buildathon1.0
claude plugin install recon@recon-marketplace
```

In the VS Code extension, type `/plugins` in the Claude Code panel to open
Manage plugins, then add the marketplace there.

`NehaPal2001/buildathon1.0` is GitHub shorthand. For another host, or for a private
repo over SSH, use the full Git URL, for example
`git@gitlab.example.com:team/recon.git`. Pin a version with `#<tag>`.

The first `/cover` run installs the plugin's npm dependencies on its own.

### Set it up for a whole team

To offer Recon to everyone who works on an app repo, commit this to that
repo's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "recon-marketplace": {
      "source": { "source": "github", "repo": "NehaPal2001/buildathon1.0" }
    }
  },
  "enabledPlugins": {
    "recon@recon-marketplace": true
  }
}
```

When a teammate trusts the repo folder, Claude Code offers to add the
marketplace and install the plugin. If they skip that prompt, they can run
`claude plugin install recon@recon-marketplace --scope project` once.

### Working on Recon itself

Load your local checkout for one session, without installing it:

```bash
git clone https://github.com/NehaPal2001/buildathon1.0.git && cd buildathon1.0 && npm ci
cd /path/to/your/app-repo
claude --plugin-dir /path/to/recon
```

## Usage

Run from the app repo's checkout:

```
/recon:cover <branch | ticket-id> [--ticket <file | text>] [--suite <dir>]
```

| Argument | Meaning |
|---|---|
| `<branch>` | The feature branch. It is compared from its merge-base with `main`, or `master`, or `origin/HEAD`, whichever is found first. |
| `<ticket-id>` | Looked up as a branch name, so `PROJ-4821` finds `feature/PROJ-4821`. If zero or several branches match, Recon asks which one. |
| `--ticket` | The ticket, as a file path or pasted text. Optional, but it is what enables the "never mentioned" and spec-vs-implementation findings. |
| `--suite` | Your Playwright suite directory, if it isn't found automatically. |

**Without a ticket,** Recon uses the commit messages as the claim. Findings
from commit messages are worded more softly ("implied by the commits"),
because a commit message is a weaker claim than a ticket.

Depending on your Claude Code version, the command may be available as
plain `/cover`.

### Output files

Everything goes under `.recon/` in the app repo:

| Path | Keep it? |
|---|---|
| `.recon/<date>-<branch>.md` | Yes. The brief: diffable, and shareable with a dev as is. |
| `.recon/analysis.json` | Yes. The validated findings the brief is rendered from. |
| `.recon/conventions.md` | Yes. Your suite's conventions, plus your exclusion rules. Hand-editable. |
| `.recon/raw/` | No. Working files, regenerated each run. Add to `.gitignore`. |

### Exclusion rules

Add an `## Exclusions` section to `.recon/conventions.md`. Recon keeps it
when it regenerates the file. Three forms are recognised:

```
- ignore states from src/legacy/**
- ignore states whose origin is a logging or telemetry branch
- treat src/payments/** as always in regression scope
```

Any other line is reported in the brief as unrecognised and is not applied.

## How it works

```
/cover <branch>
   │
   ├─ scripts (deterministic, no LLM)      → .recon/raw/*.json
   │    diff · candidates · UI surface · suite facts · conventions
   │
   ├─ Claude + skills                       → .recon/analysis.json
   │    reads ONLY the raw files, never the app source
   │    every finding must cite a candidate id from candidates.json
   │
   └─ scripts
        validate.ts   schema, citations resolve, no code-speak, exclusions
        render.ts     terminal brief + dated markdown
```

- **Extraction is code, judgement is Claude.** Scripts find every branch,
  condition, default, enum and contract constraint, each with `file:line`.
  Claude decides what each one means for a tester, and can only cite what
  the scripts found.
- **Citations can't drift.** `validate.ts` copies file, line and excerpt
  from the extracted candidate itself, so a finding can't point at a line
  that doesn't say what the finding claims.
- **No code-speak.** The validator rejects function names, call syntax and
  dotted member paths in the brief's prose. If it fails, Claude rewrites
  the prose and retries, up to three times.
- **Files that couldn't be parsed are named.** If an extractor couldn't
  read a file, the brief says which, rather than quietly reporting fewer
  findings.

Most of the judgement lives in markdown skills you can read and fork:

| Skill | Job |
|---|---|
| `skills/feature-comprehension` | Diff → behaviour → reachable states |
| `skills/contract-analysis` | OpenAPI constraints vs what the code enforces |
| `skills/tester-language` | House style: no code-speak, no overclaiming |

## Repository layout

```
.claude-plugin/     plugin.json, marketplace.json
commands/cover.md   the /cover command
skills/             the three skills above
scripts/            extractors, validate.ts, render.ts, verify.ts (TypeScript, run with tsx)
scripts/lib/        shared parsers and helpers
fixtures/           demo-shop app, PROJ-4821 ticket, setup.sh
docs/superpowers/   design spec and milestone plans
PRODUCT.md          product intent
BUILD.md            build mechanics
```

## Development

```bash
npm ci
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

Every script has a CLI with `--help`. Bad input exits with code 1 and one
line on stderr.

### Try it on the demo fixture

The fixture is a small Express shop with a coupon feature. Four bugs are
planted in it on purpose: stacking allowed despite "one coupon per order",
a declared but unchecked code pattern, a documented 422 that is actually a
500, and a discount type with no UI path.

```bash
bash fixtures/setup.sh /tmp/recon-demo       # git repo with main + feature/PROJ-4821
cd /tmp/recon-demo
claude --plugin-dir /path/to/recon
```

Inside Claude Code:

```
/recon:cover PROJ-4821 --ticket /path/to/recon/fixtures/PROJ-4821.md
```

Then check the run against the milestone's done-criteria:

```bash
npx tsx scripts/verify.ts --recon /tmp/recon-demo/.recon --milestone 2
```

Every line should say `PASS`.

**macOS note:** if Gatekeeper warns that `esbuild` "could not be verified",
click **Cancel**, not "Move to Trash". Trashing it deletes the binary and
breaks `tsx`. To recover, run `rm -rf node_modules && npm ci`, which checks
every package against the lockfile hashes.

## License

Not yet chosen.
