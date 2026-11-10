#!/bin/sh
#
# Prints the lighttpd fragment for the add-on with the server's port in it:
#   sh lighttpd-conf.sh <fragment> <mui.conf>
# The fragment names the default port (8089, config.go); a WS_PORT= in
# mui.conf replaces it, so the proxy follows the port the server listens on
# (rc.d/mui reads mui.conf for the server, and so does this script). Without the file, the line or
# with a value that is no port, the default stays. update_script writes the
# result at every install: an update never leaves the proxy on another port
# than the server.

FRAGMENT=$1
CONFIG=$2
DEFAULT_PORT=8089

# Read as rc.d/mui reads it for the server (set -a; . mui.conf), so a
# comment after the value, quotes or a Windows line end end up the same as
# there; its output must not reach the fragment. Only digits, as
# strconv.Atoi in getEnvInt (config.go) takes them, leading zeros dropped
port=$(unset WS_PORT; [ -f "$CONFIG" ] && { set -a; . "$CONFIG"; } >/dev/null 2>&1; printf %s "$WS_PORT")
case "$port" in
  '' | *[!0-9]*) port=$DEFAULT_PORT ;;
esac
port=$(printf %s "$port" | sed 's/^0*//')
[ -n "$port" ] || port=$DEFAULT_PORT
[ "$port" -le 65535 ] || port=$DEFAULT_PORT

sed "s/\"port\" => $DEFAULT_PORT\([^0-9]\)/\"port\" => $port\1/g" "$FRAGMENT"
