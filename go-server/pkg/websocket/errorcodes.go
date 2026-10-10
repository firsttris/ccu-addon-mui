package websocket

import (
	"errors"
	"slices"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/diagrams"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/rules"
	"ccu-addon-mui-server/pkg/settings"
	"ccu-addon-mui-server/pkg/tiles"
)

// An error of a service and the code the app gets for it (the codes:
// docs/protokoll.md)
type errorCode struct {
	err  error
	code string
}

// The errors of the services behind the handlers. One table, so the same
// error answers with the same code wherever it comes from.
var serviceErrorCodes = []errorCode{
	{backup.ErrSessionRequired, "PASSWORD_REQUIRED"},
	{backup.ErrInvalidCredentials, "INVALID_CREDENTIALS"},
	{backup.ErrKeyInvalid, "INVALID_VALUE"},
	{backup.ErrKeySame, "KEY_SAME"},
	{backup.ErrKeyNotAll, "KEY_NOT_ALL_DEVICES"},
	{backup.ErrWrongKey, "WRONG_KEY"},
	{backup.ErrInvalidBackup, "INVALID_BACKUP"},
	{backup.ErrInvalidFirmware, "INVALID_FIRMWARE"},
	{backup.ErrFirmwareTooOld, "FIRMWARE_TOO_OLD"},
	{backup.ErrFirmwareDownloadFailed, "DOWNLOAD_FAILED"},
	{backup.ErrInvalidDeviceFirmware, "INVALID_FIRMWARE"},
	{backup.ErrDeviceFirmwareNeedsNewerCCU, "FIRMWARE_NEEDS_NEWER_CCU"},
	{backup.ErrAddonFailed, "ADDON_FAILED"},
	{backup.ErrUploadNotFound, rega.SetNotFound},
	{diagrams.ErrInvalid, "INVALID_VALUE"},
	{diagrams.ErrNotFound, "NOT_FOUND"},
	{rules.ErrInvalid, "INVALID_VALUE"},
	{rules.ErrNotFound, "NOT_FOUND"},
	{settings.ErrInvalid, "INVALID_VALUE"},
	{settings.ErrInvalidCertificate, "INVALID_VALUE"},
	{tiles.ErrInvalid, "INVALID_VALUE"},
	{ccurpc.ErrInvalidAddress, "INVALID_VALUE"},
}

// codeOf is the code for err: that of the first error in own, then in
// serviceErrorCodes, that err wraps; CCU_ERROR for any other
func codeOf(err error, own ...errorCode) string {
	for _, c := range slices.Concat(own, serviceErrorCodes) {
		if errors.Is(err, c.err) {
			return c.code
		}
	}
	return "CCU_ERROR"
}

// failChange answers a change that failed with err and records it in the
// audit log with its code
func (s *Server) failChange(client *Client, requestID string, entry audit.Entry, err error) {
	code := codeOf(err)
	s.recordAudit(entry, code)
	s.sendRequestError(client, requestID, entry.Action+" failed: "+err.Error(), code)
}
