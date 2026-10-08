#!/usr/bin/env bash
# Materialise the demo-shop fixture as a git repo with two branches.
# usage: fixtures/setup.sh <target-dir>
set -euo pipefail

TARGET="${1:?usage: setup.sh <target-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GIT="git -c user.name=demo -c user.email=demo@example.com"

rm -rf "$TARGET"
mkdir -p "$TARGET"
# Resolve to an absolute path before the `cd` below. $TARGET is reused for the
# feature overlay after the working directory has changed, so a relative
# argument ("setup.sh demo-repo") would resolve inside the target itself and
# copy the overlay to <target>/<target>/ — leaving a feature branch with no
# coupon feature in it, while this script still printed "ready" and exited 0.
TARGET="$(cd "$TARGET" && pwd)"
cp -R "$HERE/demo-shop/base/." "$TARGET/"
cd "$TARGET"

git init -q -b main
git add -A
$GIT commit -q -m "Shop: catalogue, search, account, cart, checkout, orders"

git checkout -q -b feature/PROJ-4821
cp -R "$HERE/demo-shop/feature/." "$TARGET/"
git add -A
$GIT commit -q -m "Add coupon codes: percent and flat, one coupon per order

PROJ-4821. Users can apply a coupon at checkout. Percentage and flat
discounts are supported. Invalid codes show an error."

git checkout -q main
echo "$TARGET ready: branches main, feature/PROJ-4821 (main checked out)"
echo "next: cd $TARGET && npm install && npx playwright test"
