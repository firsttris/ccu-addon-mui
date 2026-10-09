//go:build !lite

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
// detached shell does: it reboots when the restore is staged. Once the
// server is gone (the add-ons were stopped) it also reboots when
// cp_security.cgi has ended without staging it (a broken archive), since
// only a reboot brings the add-ons back. Unpacking a large backup takes
// minutes, and the CGI unpacks it twice for a CCU2 backup, so it waits for
// the CGI to end, not for a fixed time, and 15 minutes at most.
//
// $1 is the server's PID, $2 the restore marker, $3 the reboot command,
// $4 the proc directory, $5 the seconds between checks.
const restoreRebootScript = `
alive=0
gone=0
ended=0
while [ $alive -lt 600 ]; do
  if [ -e "$2" ]; then
    # Five checks for the CGI to finish its answer
    n=0
    while [ $n -lt 5 ]; do
      sleep "$5"
      n=$((n + 1))
    done
    exec $3
  fi
  if kill -0 "$1" 2>/dev/null; then
    alive=$((alive + 1))
  else
    gone=$((gone + 1))
    # [c] keeps the pattern from matching this shell's own command line
    if grep -qs '[c]p_security\.cgi' "$4"/[0-9]*/cmdline; then
      ended=0
    else
      ended=$((ended + 1))
    fi
    if [ "$ended" -ge 10 ] || [ "$gone" -ge 900 ]; then
      exec $3
    fi
  fi
  sleep "$5"
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
	cmd := exec.Command("/bin/sh", "-c", restoreRebootScript, "restore-reboot", strconv.Itoa(os.Getpid()), "/usr/local/.doBackupRestore", "/sbin/reboot", "/proc", "1")
	// Its own session: it outlives this server
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return func() {}
	}
	go func() { _ = cmd.Wait() }()
	return func() { _ = cmd.Process.Kill() }
}
