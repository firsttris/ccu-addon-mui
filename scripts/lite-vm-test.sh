#!/bin/bash
# Tests the add-on on a real openccu-lite: boots openccu-lite's x86_64 image
# headless in QEMU, creates the first administrator, installs the add-on
# package through occulited as its Addons page does, and runs
# go-server/litevm against it, with a restart, an update, a backup, a reboot
# of the system and an uninstall with a new install in between; and the app
# in a browser (scripts/lite-vm-browser.mjs).
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
fail() { say "FAIL: $*"; diagnose; exit 1; }

# What the system says about the add-on, into the job's log: a failure here
# cannot be reproduced without the VM
diagnose() {
  [ -n "${AUTH:-}" ] || return 0
  local jar="$WORK/diag.jar"
  say "--- diagnosis"
  say "nav: $(curl -s --max-time 10 -H "$AUTH" "$BASE/api/system/v1/nav" | head -c 3000)"
  say "addons: $(curl -s --max-time 10 -H "$AUTH" "$BASE/api/system/v1/addons" | head -c 3000)"
  say "service: $(curl -s --max-time 10 -H "$AUTH" "$BASE/api/system/v1/services" | grep -o '{[^{}]*addon-mui[^{}]*}' | head -c 1500)"
  curl -s --max-time 10 -c "$jar" -o /dev/null -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/v1/login"
  for path in /addons/mui/ /addons/mui/index.html /addons/mui/assets/ /addons/mui/ws; do
    say "GET $path with a session: HTTP $(curl -s --max-time 10 -b "$jar" -o "$WORK/diag.body" -w '%{http_code}' "$BASE$path") $(head -c 200 "$WORK/diag.body" | tr '\n' ' ')"
  done
  for query in 'q=lighttpd' 'q=mui' 'unit=addon-mui' 'unit=lighttpd'; do
    say "log $query:"
    curl -s --max-time 20 -H "$AUTH" "$BASE/api/system/v1/log?$query&limit=60" \
      | grep -oE '"message":"([^"\\]|\\.)*"' | sed 's/^"message":"//; s/"$//; s/\\"/"/g; s/^/  | /' | tail -60
  done
  say "--- end of diagnosis"
}
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

# A new session of the administrator, after a reboot
relogin() {
  curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"username\":\"$USER_NAME\",\"password\":\"$PASSWORD\"}" "$BASE/api/auth/v1/login" > "$WORK/login.json"
  SID=$(sed -n 's/.*"sid":"\([^"]*\)".*/\1/p' "$WORK/login.json")
  [ -n "$SID" ] || fail "no session after the reboot: $(cat "$WORK/login.json")"
  AUTH="Authorization: Bearer $SID"
}

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
    MUI_VM_PHASE="$1" go test -count=1 -tags litevm -v ./litevm) 2>&1 | tee -a "$OUT/litevm.log"; then
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
phase verify
step "update"

# --- levels: configure and operate, a heating group, lite-rpc -------------------------
phase levels
step "levels, heating group, values, settings"

# --- the app in a browser, through lighttpd and the gate ------------------------------
# The room's name as go-server/litevm makes it (ciRoom)
if ! (cd "$ROOT" && node scripts/lite-vm-browser.mjs "$BASE" "$USER_NAME" "$PASSWORD" "CI-Raum Küche Öfen Maß" "$OUT") 2>&1 | tee -a "$OUT/browser.log"; then
  fail "the app in the browser"
fi
step "app in the browser"

# --- the backup carries the add-on's data ------------------------------------------
# What openccu-lite's backup takes (createBackup.sh: usr_local.tar.gz inside
# the .sbk). A restore replaces /usr/local and reboots; that it brings the
# files back is the system's part, that they are in it is ours.
code=$(curl -s -o "$WORK/backup.sbk" -w '%{http_code}' --max-time 300 -H "$AUTH" "$BASE/api/system/v1/backup")
[ "$code" = 200 ] || fail "backup: HTTP $code"
tar -xOf "$WORK/backup.sbk" usr_local.tar.gz | tar -tz > "$OUT/backup-files.txt" || fail "backup is not an .sbk with usr_local.tar.gz"
for file in etc/config/addons/mui/mui-lite.json etc/config/addons/mui/userprofiles; do
  grep -q "$file" "$OUT/backup-files.txt" || fail "the backup lacks $file: $(grep addons/mui "$OUT/backup-files.txt" | head -20)"
done
say "backup: $(grep -c addons/mui "$OUT/backup-files.txt") entries of the add-on, program files $(grep -q 'addons/mui/go-server' "$OUT/backup-files.txt" && echo in it || echo not in it)"
step "backup"

# --- a reboot of the system: the add-on comes up by itself --------------------------
# It starts early (the manifest's "start": "early") and waits for the
# interface processes itself; the data must be there afterwards
code=$(curl -s -o "$OUT/reboot.json" -w '%{http_code}' --max-time 30 -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"confirm":true}' "$BASE/api/system/v1/reboot")
[ "$code" -lt 300 ] || fail "reboot refused: HTTP $code $(cat "$OUT/reboot.json")"
for _ in $(seq 1 60); do
  curl -s --max-time 3 "$BASE/api/system/v1/health" | grep -q '"ok":true' || break
  sleep 2
done
wait_health
relogin
phase verify
step "reboot"

# --- the journal ---------------------------------------------------------------------
curl -s -H "$AUTH" "$BASE/api/system/v1/log?unit=addon-mui&limit=2000" > "$OUT/addon-mui.log.json"
# The add-on runs without root in its own directories: nothing it writes may be refused
if grep -iEo '[^"]*(permission denied|read-only file system|EACCES|EROFS|panic:)[^"]*' "$OUT/addon-mui.log.json"; then
  fail "the add-on's journal has errors writing or a panic"
fi
step "journal"

# --- uninstall and install again: the add-on's data goes with it --------------------
code=$(curl -s -o "$OUT/uninstall.json" -w '%{http_code}' --max-time 120 -X POST -H "$AUTH" "$BASE/api/system/v1/addons/mui/uninstall")
say "uninstall: HTTP $code $(head -c 600 "$OUT/uninstall.json")"
[ "$code" -lt 300 ] || fail "uninstall refused"
grep -q '"ok":true' "$OUT/uninstall.json" || fail "uninstall did not succeed"
curl -s -H "$AUTH" "$BASE/api/system/v1/addons" | grep -q '"id":"mui"' && fail "mui is still in the addon list after the uninstall"
install again
phase fresh
step "uninstall, install again"

# --- logout last: the test logs in and out with a session of its own ----------------
phase logout
step "logout ends the connection"
say "OK"
