package websocket

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

// restoreRebootScript reboots the CCU once a restore is staged. The WebUI's
// action_backup_restore_go stops every add-on (run-parts -a stop
// /etc/config/rc.d, cp_security.cgi), this server too, before it unpacks
// the backup and touches /usr/local/.doBackupRestore; in the WebUI the
// browser then posts action=reboot. The server can't wait for that, so a
// detached shell does: it reboots when the restore is staged, or, once the
// server is gone (the add-ons were stopped), after two minutes at the
// latest, since only a reboot brings them back. $1 is the server's PID.
const restoreRebootScript = `
i=0
while [ $i -lt 600 ]; do
  if [ -e /usr/local/.doBackupRestore ]; then
    sleep 5
    exec /sbin/reboot
  fi
  if ! kill -0 "$1" 2>/dev/null; then
    gone=$((gone + 1))
    [ "$gone" -ge 120 ] && exec /sbin/reboot
  fi
  i=$((i + 1))
  sleep 1
done
`

// armRestoreReboot starts the shell and returns a function that stops it:
// called when the restore ends without stopping the add-ons (a wrong key,
// a backup of a newer firmware). Does nothing off the CCU.
func armRestoreReboot() (disarm func()) {
	if !onCCU() {
		return func() {}
	}
	if _, err := os.Stat("/sbin/reboot"); err != nil {
		return func() {}
	}
	cmd := exec.Command("/bin/sh", "-c", restoreRebootScript, "restore-reboot", strconv.Itoa(os.Getpid()))
	// Its own session: it outlives this server
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return func() {}
	}
	go func() { _ = cmd.Wait() }()
	return func() { _ = cmd.Process.Kill() }
}
