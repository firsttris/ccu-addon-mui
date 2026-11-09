#!/bin/sh
#
# Whether the add-on's server runs and, when it doesn't, the line it stopped
# with. index.html asks for this when the app's scripts don't load (the
# server delivers them, lighttpd.conf). lighttpd runs this script itself, so
# it answers while the server is down, and without a login: it hands out
# nothing else from the log, which holds user names, addresses and changes.

PID_FILE=${MUI_PID_FILE:-/var/run/mui-websocket-server.pid}
LOG_FILE=${MUI_LOG_FILE:-/var/log/mui-websocket-server.log}
# (Set by the tests only: a request can't, lighttpd passes HTTP headers as
# HTTP_* and nothing else of the caller's)

running=false
pid=$(cat "$PID_FILE" 2>/dev/null)
case "$pid" in
  '' | *[!0-9]*) ;;
  *)
    # The PID of a server that is gone may belong to another process by
    # now. "(deleted)" follows the path while an update replaces the binary
    case "$(readlink "/proc/$pid/exe" 2>/dev/null)" in
      */ccu-addon-mui-server | */ccu-addon-mui-server\ *) running=true ;;
    esac
    ;;
esac

reason=""
if [ $running = false ]; then
  # Only since the last start. The lines the server ends with (main.go:
  # "❌ Stopped:" and "Failed to start"; not any ❌, the server keeps running
  # after others, e.g. a rejected connection anyone can cause), Go's own for
  # a crash, and the shell's when the binary doesn't run at all (rc.d/mui
  # writes its errors to the log too)
  reason=$(awk '
    /🚀 WebSocket Server starting/ { line = "" }
    /❌ Stopped: |Failed to start|^panic: |^fatal error: |ccu-addon-mui-server: / { line = $0 }
    END { print line }
  ' "$LOG_FILE" 2>/dev/null | cut -c1-300 | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')
fi

printf 'Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\n\r\n'
printf '{"running":%s,"reason":"%s"}\n' "$running" "$reason"
