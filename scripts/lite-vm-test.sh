#!/bin/bash
# Tests the add-on on a real openccu-lite: boots openccu-lite's x86_64 image
# headless in QEMU, creates the first administrator, installs the add-on
# package through occulited as its Addons page does, and runs
# go-server/litevm against it, with a restart and an update in between.
# Boots the way openccu-lite's own scripts/lite-qemu-test.sh does (BIOS grub,
# raw disk, user network with lighttpd on a forwarded port).
#
# Usage: scripts/lite-vm-test.sh <openccu-lite-x86_64-ova-*.zip or .img> <mui-*-x86_64-lite.tar.gz> [port]
#
# Uses KVM when /dev/kvm is writable, otherwise TCG (several times slower).
# Writes the serial log, occulited's answers and the add-on's journal to
# LITE_VM_OUT (default: lite-vm-out). The VM has no radio module: devices,
# pairing and radio values stay a test on real hardware.
set -euo pipefail

IMAGE=${1:?openccu-lite image (.zip or .img)}
PACKAGE=${2:?add-on package (mui-*-x86_64-lite.tar.gz)}
PORT=${3:-8090}
BASE="http://127.0.0.1:$PORT"
OUT=$(mkdir -p "${LITE_VM_OUT:-lite-vm-out}" && cd "${LITE_VM_OUT:-lite-vm-out}" && pwd)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PACKAGE=$(cd "$(dirname "$PACKAGE")" && pwd)/$(basename "$PACKAGE")
WORK=$(mktemp -d "${LITE_VM_WORKDIR:-/var/tmp}/lite-vm.XXXXXX")
USER_NAME=ci-admin
PASSWORD="ci-$(date +%s)-$RANDOM-lite"
STARTED=$(date +%s)
LAST=$STARTED
TIMINGS="$OUT/timings.txt"
: > "$TIMINGS"

say() { printf '%s %s\n' "$(date +%T)" "$*"; }
fail() { say "FAIL: $*"; exit 1; }
# the duration of each step, for the job summary
step() {
  local now; now=$(date +%s)
  printf '%-40s %4ss\n' "$1" "$((now - LAST))" | tee -a "$TIMINGS"
  LAST=$now
}

cleanup() {
  local rc=$?
  if [ -f "$WORK/qemu.pid" ]; then kill "$(cat "$WORK/qemu.pid")" 2>/dev/null || true; fi
  [ -f "$WORK/serial.log" ] && cp "$WORK/serial.log" "$OUT/serial.log"
  rm -rf "$WORK"
  printf '%-40s %4ss\n' "total" "$(( $(date +%s) - STARTED ))" | tee -a "$TIMINGS"
  exit $rc
}
trap cleanup EXIT

# --- the disk ---------------------------------------------------------------
case "$IMAGE" in
  *.zip)
    unzip -q -o "$IMAGE" '*.img' -d "$WORK/unzip"
    IMG=$(find "$WORK/unzip" -name '*.img' | head -1)
    [ -n "$IMG" ] || fail "no .img in $IMAGE"
    mv "$IMG" "$WORK/disk.img"
    rm -rf "$WORK/unzip" ;;
  *) cp --sparse=always "$IMAGE" "$WORK/disk.img" ;;
esac
# a real VM disk is bigger than the image: the userfs grows into the rest
truncate -s +2G "$WORK/disk.img"
step "unpack image"

# --- boot -------------------------------------------------------------------
ACCEL=(-cpu qemu64)
if [ -w /dev/kvm ]; then ACCEL=(-enable-kvm -cpu host); say "KVM"; else say "no KVM: TCG, booting takes minutes"; fi
qemu-system-x86_64 -m 2048 -smp 2 "${ACCEL[@]}" \
  -drive file="$WORK/disk.img",format=raw,if=virtio \
  -netdev user,id=n0,hostfwd=tcp:127.0.0.1:$PORT-:80 -device virtio-net-pci,netdev=n0 \
  -display none -serial file:"$WORK/serial.log" -pidfile "$WORK/qemu.pid" -daemonize

wait_health() {
  for _ in $(seq 1 180); do
    kill -0 "$(cat "$WORK/qemu.pid")" 2>/dev/null || fail "QEMU is gone"
    if curl -s --max-time 3 "$BASE/api/system/v1/health" | grep -q '"ok":true'; then return 0; fi
    sleep 5
  done
  fail "occulited did not answer through lighttpd"
}
wait_health
say "openccu-lite: $(curl -s "$BASE/api/system/v1/health")"
curl -s "$BASE/api/system/v1/health" > "$OUT/health.json"
step "boot"

# --- the first administrator --------------------------------------------------
curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/v1/setup" > "$WORK/setup.json"
SID=$(sed -n 's/.*"sid":"\([^"]*\)".*/\1/p' "$WORK/setup.json")
[ -n "$SID" ] || fail "no session from the setup: $(cat "$WORK/setup.json")"
AUTH="Authorization: Bearer $SID"
step "setup"

# --- install, as the Addons page uploads it ------------------------------------
install() {
  local code
  code=$(curl -s -o "$OUT/install-$1.json" -w '%{http_code}' --max-time 600 -X POST -H "$AUTH" \
    -H 'Content-Type: application/gzip' --data-binary @"$PACKAGE" "$BASE/api/system/v1/addons/install?wait=true")
  say "install ($1): HTTP $code $(head -c 600 "$OUT/install-$1.json")"
  [ "$code" -lt 300 ] || fail "the install was refused"
  curl -s -H "$AUTH" "$BASE/api/system/v1/addons" > "$OUT/addons-$1.json"
  grep -q '"id":"mui"' "$OUT/addons-$1.json" || fail "mui is not in the addon list: $(cat "$OUT/addons-$1.json")"
}
install first
step "install"

phase() {
  say "litevm: $1"
  if ! (cd "$ROOT/go-server" && MUI_VM_BASE="$BASE" MUI_VM_USER="$USER_NAME" MUI_VM_PASSWORD="$PASSWORD" \
    MUI_VM_PHASE="$1" MUI_VM_CLEANUP="${2:-}" go test -count=1 -tags litevm -v ./litevm) 2>&1 | tee -a "$OUT/litevm.log"; then
    fail "litevm $1"
  fi
}

# The app's page through the gate, with a session; without one a browser is
# sent to the login
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' "$BASE/addons/mui/")
[ "$code" = 302 ] || fail "/addons/mui/ without a session: HTTP $code (want 302)"
phase prepare
step "app: login, reads, room, language"

# --- restart and update keep the data ---------------------------------------------
code=$(curl -s -o "$OUT/restart.json" -w '%{http_code}' --max-time 60 -X POST -H "$AUTH" "$BASE/api/system/v1/services/addon-mui/restart")
say "restart: HTTP $code $(cat "$OUT/restart.json")"
[ "$code" -lt 300 ] || fail "restart refused"
phase verify
step "restart"
install update
phase verify 1
step "update"

# --- the journal ---------------------------------------------------------------------
curl -s -H "$AUTH" "$BASE/api/system/v1/log?unit=addon-mui&limit=2000" > "$OUT/addon-mui.log.json"
# The add-on runs without root in its own directories: nothing it writes may be refused
if grep -iEo '[^"]*(permission denied|read-only file system|EACCES|EROFS|panic:)[^"]*' "$OUT/addon-mui.log.json"; then
  fail "the add-on's journal has errors writing or a panic"
fi
step "journal"

# --- logout last: the test logs in and out with a session of its own ----------------
phase logout
step "logout ends the connection"
say "OK"
