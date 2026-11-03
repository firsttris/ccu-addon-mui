#!/usr/bin/env bash
# Test: every "Set up Bun" step of the workflows that run in the Playwright image
# (playwright-e2e.yml, screenshots.yml) installs the Bun that packageManager in
# package.json pins, in that image, also when that Bun is not npm's latest.
# Needs Docker and the npm registry. Run: scripts/test/ci-bun-version.sh
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
want=1.3.0 # an older Bun than npm's latest, so "whatever npm installs" does not pass by chance
playwright=$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' "$root/bun.lock" | head -1 | cut -d@ -f3)
image=mcr.microsoft.com/playwright:v$playwright-noble

# The script of each "Set up Bun" step, inline (run: ...) or as a block (run: |)
steps() {
  awk '
    /- name: Set up Bun$/ { s = 1; r = 0; next }
    s && /^ +- / { if (r) print "--"; s = 0; r = 0; next }
    s && /^ +run: \|/ { r = 1; next }
    s && /^ +run: / { sub(/^ +run: /, ""); print; print "--"; s = 0; next }
    s && r && /^ *$/ { print "--"; s = 0; r = 0; next }
    s && r { sub(/^ +/, ""); print }
  ' "$1"
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sed -E "s/\"packageManager\": \"bun@[^\"]+\"/\"packageManager\": \"bun@$want\"/" "$root/package.json" >"$work/package.json"

# Behind a proxy (HTTPS_PROXY, NODE_EXTRA_CA_CERTS), hand it on to npm in the container
args=(--rm --network host -v "$work:/w" -w /w)
proxy=${HTTPS_PROXY:-${https_proxy:-}}
[ -z "$proxy" ] || args+=(-e "npm_config_https_proxy=$proxy" -e "npm_config_proxy=$proxy")
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; then
  args+=(-v "$NODE_EXTRA_CA_CERTS:/ca.crt:ro" -e NODE_EXTRA_CA_CERTS=/ca.crt -e npm_config_cafile=/ca.crt)
fi

failed=0
count=0
declare -A result # the same script runs once
for workflow in playwright-e2e.yml screenshots.yml; do
  step=''
  while IFS= read -r line; do
    if [ "$line" != -- ]; then
      step+=$line$'\n'
      continue
    fi
    count=$((count + 1))
    if [ -z "${result[$step]+x}" ]; then
      # bash -e as GitHub runs a step's script
      result[$step]=$(docker run "${args[@]}" "$image" bash -e -c "{ $step
} >&2; bun --version" || echo "step failed")
    fi
    got=${result[$step]}
    if [ "$got" != "$want" ]; then
      echo "FAIL: $workflow: packageManager pins bun@$want, the Set up Bun step installed: $got"
      failed=1
    fi
    step=''
  done < <(steps "$root/.github/workflows/$workflow")
done
[ "$count" -gt 0 ] || { echo "FAIL: no Set up Bun step found"; exit 1; }
[ "$failed" = 0 ] || exit 1
echo "ok: all $count Set up Bun steps install bun $want"
