#!/bin/sh
#
# Prints the lighttpd fragment for the add-on with the server's port in it:
#   sh lighttpd-conf.sh <fragment> <mui.conf>
# The fragment names the default port (8089, config.go); a WS_PORT= in
# mui.conf replaces it, so the proxy follows the port the server listens on
# (rc.d/mui reads mui.conf for the server). Without the file, the line or
# with a value that is no port, the default stays. update_script writes the
# result at every install: an update never leaves the proxy on another port
# than the server.

FRAGMENT=$1
CONFIG=$2
DEFAULT_PORT=8089

# The last WS_PORT= wins, as when the file is sourced; quotes and "export"
# as a shell allows them
port=$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}WS_PORT=//p' "$CONFIG" 2>/dev/null | tail -n 1 | tr -d "\"' \t\r")
case "$port" in
  '' | *[!0-9]* | 0*) port=$DEFAULT_PORT ;;
esac
[ "$port" -le 65535 ] || port=$DEFAULT_PORT

sed "s/\"port\" => $DEFAULT_PORT\([^0-9]\)/\"port\" => $port\1/g" "$FRAGMENT"
