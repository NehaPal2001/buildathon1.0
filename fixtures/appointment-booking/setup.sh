#!/usr/bin/env bash
# Materialise the appointment-booking fixture as a git repo: main plus two
# independent feature branches, each one commit off main.
# usage: fixtures/appointment-booking/setup.sh <target-dir>
set -euo pipefail

TARGET="${1:?usage: setup.sh <target-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GIT="git -c user.name=demo -c user.email=demo@example.com"

rm -rf "$TARGET"
mkdir -p "$TARGET"
# Absolute path before the `cd` below: $TARGET is reused for each overlay after
# the working directory has changed.
TARGET="$(cd "$TARGET" && pwd)"

# Copy a tree without node_modules/test-results. Those are gitignored, and a
# copied node_modules carries binaries for the wrong OS.
copy_tree() {
  (cd "$1" && tar cf - --exclude=node_modules --exclude=test-results --exclude=playwright-report .) \
    | (cd "$TARGET" && tar xf -)
}

copy_tree "$HERE/base"
cd "$TARGET"

git init -q -b main
git add -A
$GIT commit -q -m "Clinic booking: services, providers, booking, appointments, account"

# Both branches start from this same main commit; neither contains the other.
git checkout -q -b feature/BOOK-101-reschedule-cancel
copy_tree "$HERE/feature-reschedule"
git add -A
$GIT commit -q -m "Add reschedule and late-cancellation fee: reschedule once, up to 24h before

BOOK-101. Patients can move an appointment to another slot, once, up to 24
hours before it starts. Cancelling less than 24 hours before the appointment
shows a flat fee notice. If the new slot is taken, an error is shown."
git checkout -q main

git checkout -q -b feature/BOOK-102-recurring
copy_tree "$HERE/feature-recurring"
git add -A
$GIT commit -q -m "Add recurring weekly appointments: 2 to 8 occurrences, all or nothing

BOOK-102. Patients can book the same provider weekly for 2 to 8 weeks. If any
occurrence is unavailable the whole booking fails and the conflicting date is
shown."
git checkout -q main

echo "$TARGET ready: branches main, feature/BOOK-101-reschedule-cancel, feature/BOOK-102-recurring (main checked out)"
echo "next: cd $TARGET && npm install && npx playwright install chromium && npx playwright test"
