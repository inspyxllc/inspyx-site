#!/bin/bash
# Runs tools/check_rules.js with Vercel's own route reader, installing that reader once (pinned) in a cache folder
# outside the repo. A vercel.json change must pass this before it merges: a rule Vercel refuses fails the whole build,
# and a rule the checks were never run against drifts from them unseen.
# usage: bash tools/check_rules.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/inspyx-vercel-reader"
if [ ! -d "$cache/node_modules/@vercel/routing-utils" ]; then
  mkdir -p "$cache"
  (cd "$cache" && npm init -y >/dev/null && npm i --silent --no-audit --no-fund @vercel/routing-utils@6.6.1 >/dev/null)
fi
NODE_PATH="$cache/node_modules" exec node "$here/check_rules.js"
