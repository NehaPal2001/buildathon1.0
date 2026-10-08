#!/usr/bin/env bash
# Run every extractor for one branch. usage: extract-all.sh <repo> <branch> [suite-dir]
set -euo pipefail
REPO="$1"; BRANCH="$2"; SUITE="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$REPO/.recon/raw"
mkdir -p "$RAW"

# tsx is resolved from the plugin's own node_modules and run through node, not
# via `npx tsx`. The extractors run with the cwd set to the app repo, so `npx`
# would resolve tsx against *that* repo: it would pick up an unrelated (or
# broken) local tsx, or silently download one from the network, even though the
# plugin already installed the version it was tested against.
TSX="$HERE/../node_modules/tsx/dist/cli.mjs"
if [ ! -f "$TSX" ]; then
  echo "tsx not found at $TSX — run: npm install --prefix \"$HERE/..\"" >&2
  exit 1
fi
tsx() { node "$TSX" "$@"; }

tsx "$HERE/diff.ts" --repo "$REPO" --branch "$BRANCH" ${SUITE:+--suite "$SUITE"} --out "$RAW/diff.json"

# diff.json is read by passing its path as a real argument rather than splicing
# it into the -e source. Under Git Bash the paths here are POSIX ("/tmp/…"),
# which node.exe cannot resolve; MSYS rewrites such paths to Windows form when
# they are argv entries, but not when they sit inside a string of code.
read_diff() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));console.log(d[process.argv[1]] ?? "")' "$1" "$RAW/diff.json"; }
RESOLVED_BRANCH="$(read_diff branch)"
SUITE_DIR="$(read_diff suiteDir)"
tsx "$HERE/candidates.ts" --repo "$REPO" --diff "$RAW/diff.json" --out "$RAW/candidates.json"
tsx "$HERE/ui-surface.ts" --repo "$REPO" --branch "$RESOLVED_BRANCH" ${SUITE_DIR:+--suite "$SUITE_DIR"} --out "$RAW/ui.json"
if [ -n "$SUITE_DIR" ]; then
  tsx "$HERE/suite-facts.ts" --repo "$REPO" --branch "$RESOLVED_BRANCH" --suite "$SUITE_DIR" --out "$RAW/suite.json"
  tsx "$HERE/conventions.ts" --suite "$RAW/suite.json" --out "$REPO/.recon/conventions.md"
fi
echo "raw files written to $RAW"
