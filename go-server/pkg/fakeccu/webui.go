package fakeccu

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

// The fake CCU (fakeccu.go): the WebUI: login, backups, uploads, maintenance and the test control

// handleControl lets tests outside Go drive the fake CCU:
//
//	POST /fake/set   {"interface", "address", "datapoint", "value"}  a device reports a value
//	POST /fake/reset                                                  back to the fixture
func (c *CCU) handleControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	switch r.URL.Path {
	case "/fake/reset":
		c.Reset()
	case "/fake/set":
		var req struct {
			Interface string `json:"interface"`
			Address   string `json:"address"`
			Datapoint string `json:"datapoint"`
			Value     any    `json:"value"`
		}
		if err := jsonDecode(r.Body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := c.SetValue(req.Interface, req.Address, req.Datapoint, req.Value); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (c *CCU) handleWebUI(w http.ResponseWriter, r *http.Request) {
	if c.Lite && !strings.HasPrefix(r.URL.Path, "/fake/") {
		c.handleOcculited(w, r)
		return
	}
	for _, route := range webUIRoutes {
		if route.matches(r) {
			route.handle(c, w, r)
			return
		}
	}
	c.handleJSONRPC(w, r)
}

// A page or API the fake answers: which requests, and how
type route struct {
	matches func(r *http.Request) bool
	handle  func(c *CCU, w http.ResponseWriter, r *http.Request)
}

// The WebUI's pages and CGIs the fake answers, before its JSON-RPC API
var webUIRoutes = []route{
	{pathPrefix("/fake/", ""), (*CCU).handleControl},
	{pathPrefix("/pages/jpages/group/", http.MethodPost), (*CCU).handleGroups},
	{pathPrefix("/pages/jpages/system/DeviceFirmware/", http.MethodPost), (*CCU).handleDeviceFirmware},
	{pathPrefix("/firmware/", ""), (*CCU).handleUpdateServer},
	{path("/config/cp_security.cgi", ""), (*CCU).handleBackup},
	{path("/config/fileupload.ccc", ""), (*CCU).handleFileUpload},
	{path("/config/cp_software.cgi", http.MethodPost), (*CCU).handleSoftware},
	{path("/config/cp_maintenance.cgi", ""), (*CCU).handleMaintenance},
	{path("/EULA.de", ""), (*CCU).handleEula},
	{path("/EULA.en", ""), (*CCU).handleEula},
}

// path matches one path, with method if it is not ""
func path(p, method string) func(r *http.Request) bool {
	return func(r *http.Request) bool { return r.URL.Path == p && (method == "" || r.Method == method) }
}

func pathPrefix(prefix, method string) func(r *http.Request) bool {
	return func(r *http.Request) bool {
		return strings.HasPrefix(r.URL.Path, prefix) && (method == "" || r.Method == method)
	}
}

// The licence of a staged firmware that has one
func (c *CCU) handleEula(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	staged := c.stagedFirmware
	c.mu.Unlock()
	if !strings.Contains(staged, FakeFirmwareEula) {
		http.NotFound(w, r)
		return
	}
	_, _ = io.WriteString(w, "Lizenzbedingungen der Fake-Firmware")
}

const (
	jsonRPCAccessDenied  = `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":400,"message":"access denied"}}`
	jsonRPCUnknownMethod = `{"version":"1.1","result":null,"error":{"code":404,"message":"unknown method"}}`
)

// The JSON-RPC methods that need the session of a login, and what they
// answer
var sessionMethods = map[string]func(c *CCU, method string, params map[string]any) string{
	"CCU.setSecurityLevel": func(c *CCU, _ string, params map[string]any) string {
		return c.setSecurityLevel(fmt.Sprint(params["level"]))
	},
	// OpenCCU's downloadFirmware.tcl: wget of the newest release to
	// /usr/local/tmp/firmwareUpdateFile
	"CCU.downloadFirmware": func(c *CCU, _ string, _ map[string]any) string {
		c.mu.Lock()
		c.calls["JSON-RPC CCU.downloadFirmware"]++
		c.mu.Unlock()
		ok := c.FirmwareDownloadFile != "" && os.WriteFile(c.FirmwareDownloadFile, []byte(FakeFirmwareDownload), 0o644) == nil
		return fmt.Sprintf(`{"version":"1.1","result":%t,"error":null}`, ok)
	},
	"Firewall.setConfiguration": func(c *CCU, _ string, params map[string]any) string { return c.setFirewall(params) },
}

func init() {
	for _, method := range []string{
		"CCU.setSSH", "CCU.setSSHPassword", "CCU.setSNMPEnabled", "CCU.restartSSHDaemon", "CCU.setAuthEnabled",
		"CCU.setHttpsRedirectEnabled", "User.restartLighttpd", "User.existsCertificate", "BidCoS_RF.isKeySet",
		"BidCoS_RF.validateKey",
	} {
		sessionMethods[method] = (*CCU).securityMethod
	}
	for _, method := range []string{"BidCoS_RF.setConfigurationRF", "BidCoS_Wired.setConfigurationWired", "BidCoS.changeLanGatewayKey"} {
		sessionMethods[method] = (*CCU).lanGatewayMethod
	}
}

// handleJSONRPC answers the WebUI's JSON-RPC API: login, logout and the
// methods behind a session
func (c *CCU) handleJSONRPC(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Method string         `json:"method"`
		Params map[string]any `json:"params"`
	}
	if err := jsonDecode(r.Body, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	switch req.Method {
	case "Session.login":
		_, _ = io.WriteString(w, c.login(fmt.Sprint(req.Params["username"]), fmt.Sprint(req.Params["password"])))
	case "Session.logout":
		_, _ = io.WriteString(w, `{"version":"1.1","result":true,"error":null}`)
	default:
		method, ok := sessionMethods[req.Method]
		switch {
		case !ok:
			_, _ = io.WriteString(w, jsonRPCUnknownMethod)
		case req.Params["_session_id_"] != "fakeSession1":
			_, _ = io.WriteString(w, jsonRPCAccessDenied)
		default:
			_, _ = io.WriteString(w, method(c, req.Method, req.Params))
		}
	}
}

// login answers Session.login: the one session for a user of the fixture
func (c *CCU) login(username, password string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, user := range c.fixture.Users {
		if user.Name == username && user.Password == password {
			return `{"version":"1.1","result":"fakeSession1","error":null}`
		}
	}
	return `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":501,"message":"invalid credentials"}}`
}

// FakeBackup is the content of every backup the fake CCU creates
const FakeBackup = "fake CCU backup (usr_local.tar.gz, signature, key_index, firmware_version)"

// handleBackup is the WebUI's "create backup" button: with a valid session
// it sends a .sbk file, otherwise the login page.
func (c *CCU) handleBackup(w http.ResponseWriter, r *http.Request) {
	// Like the WebUI, which looks for the session in the raw query
	if strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") && r.Method == http.MethodPost {
		if r.FormValue("action") == "change_key" {
			c.changeKey(w, r.FormValue("key1"), r.FormValue("key2"))
			return
		}
		if r.FormValue("action") == "factory_reset_go" {
			c.factoryReset(w, r.FormValue("key"))
			return
		}
		c.handleRestoreAction(w, r.FormValue("action"), r.FormValue("key"), r.FormValue("filename"))
		return
	}
	c.mu.Lock()
	c.calls["WebUI create_backup"]++
	c.mu.Unlock()
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") || r.URL.Query().Get("action") != "create_backup" {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	// Headers as in the WebUI's backup.tcl
	w.Header().Set("Content-Type", "application/x-download")
	w.Header().Set("Content-Disposition", "attachment;filename=ccu3-webui-2026-10-03.sbk")
	_, _ = io.WriteString(w, FakeBackup)
}

// The fake's backups to restore: FakeBackup is fine; with FakeBackupKeyed
// in it the backup needs the key FakeBackupKey, with FakeBackupNewer it is
// from a newer firmware
const (
	FakeBackupKeyed = "signed with a user key"
	FakeBackupKey   = "Schluessel1"
	FakeBackupNewer = "firmware_version 9.9.9"
)

// Where the fake's fileupload.ccc stores an upload (mktemp -p /usr/local/tmp)
const fakeTempFile = "/usr/local/tmp/tmp.Fake01"

// handleFileUpload is the WebUI's fileupload.ccc: one file, an admin
// session, then the action of the page in "url"
func (c *CCU) handleFileUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	query := r.URL.Query()
	if r.Method != http.MethodPost {
		_, _ = io.WriteString(w, "ERROR: no POST request")
		return
	}
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") {
		_, _ = io.WriteString(w, "ERROR: no valid admin session id")
		return
	}
	valid := (query.Get("action") == "backup_upload" && query.Get("url") == "/config/cp_security.cgi") ||
		(query.Get("action") == "firmware_upload" && query.Get("url") == "/config/cp_maintenance.cgi") ||
		(query.Get("action") == "image_upload" && query.Get("url") == "/config/cp_software.cgi")
	field := "backup_file"
	if query.Get("action") != "backup_upload" {
		field = "firmware_file"
	}
	if !valid || r.ContentLength <= 0 {
		_, _ = io.WriteString(w, "ERROR: missing required URL parameters")
		return
	}
	file, _, err := r.FormFile(field)
	if err != nil {
		_, _ = io.WriteString(w, "ERROR: "+err.Error())
		return
	}
	data, _ := io.ReadAll(file)
	c.mu.Lock()
	c.tempUpload = string(data)
	c.calls["WebUI upload "+query.Get("action")]++
	c.mu.Unlock()
	// As fileupload.ccc: the page sends the browser on with the temp file
	_, _ = fmt.Fprintf(w, "<script>var url = '%s?sid=@fakeSession1@';\ndlgPopup.LoadFromFile(url, 'action=%s&filename=%s');</script>",
		query.Get("url"), query.Get("action"), fakeTempFile)
}

// handleRestoreAction answers cp_security.cgi's restore steps with the
// WebUI's untranslated ${...} texts
func (c *CCU) handleRestoreAction(w http.ResponseWriter, action, key, filename string) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["WebUI "+action]++
	backup := c.uploadedBackup
	keyed := strings.Contains(backup, FakeBackupKeyed)
	switch action {
	case "backup_upload":
		// action_backup_upload moves the temp file to new_config.tar
		if filename == fakeTempFile && c.tempUpload != "" {
			c.uploadedBackup, c.tempUpload = c.tempUpload, ""
		}
		_, _ = io.WriteString(w, `<script>dlgPopup.LoadFromFile(url, "action=backup_restore_check");</script>`)
	case "backup_restore_check":
		// It unpacks new_config.tar and deletes it
		c.checkedBackup, c.uploadedBackup = "", ""
		if !strings.Contains(backup, FakeBackup) {
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupInvalidFileTitle}</div>`)
			return
		}
		c.checkedBackup = backup
		if keyed {
			_, _ = io.WriteString(w, `<div id="performUpdateTitle">${dialogSettingsSecurityMessageSysBackupPerformTitle}</div><input type="text" name="key" size="16" id="text_key" type="password">`)
		} else {
			_, _ = io.WriteString(w, `<div id="performUpdateTitle">${dialogSettingsSecurityMessageSysBackupPerformTitle}</div><input type=hidden name="key" value=dummy id="text_key"/>`)
		}
	case "backup_restore_go":
		// It works on what the check unpacked
		backup = c.checkedBackup
		keyed = strings.Contains(backup, FakeBackupKeyed)
		switch {
		case c.checkedBackup == "":
			_, _ = io.WriteString(w, `${dialogSettingsSecurityMessageSysBackupErrorTitle}`)
		case keyed && key != FakeBackupKey:
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupSecurityErrorTitle}</div>${dialogSettingsSecurityMessageSysBackupSecurityError2Content}`)
		case strings.Contains(backup, FakeBackupNewer):
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupFWUpdateNecessaryTitle}</div>`)
		default:
			c.restoredBackup = c.checkedBackup
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsSecurityMessageSysBackupRestartSystemTitle}</div>`)
		}
	case "reboot":
		if c.restoredBackup != "" {
			c.rebooted = true
		}
	}
}

// The fake's firmware files: with FakeFirmware in it a file is a firmware
// update, with FakeFirmwareEula also it has a licence text
const (
	FakeFirmware     = "fake CCU firmware update"
	FakeFirmwareEula = "with EULA"
	// What CCU.downloadFirmware downloads, as from GitHub
	FakeFirmwareDownload = FakeFirmware + " " + FakeFirmwareEula + " (OpenCCU release)"
)

// handleMaintenance answers cp_maintenance.cgi's firmware update steps
func (c *CCU) handleMaintenance(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") || r.Method != http.MethodPost {
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	action := r.FormValue("action")
	c.calls["WebUI "+action]++
	switch action {
	case "firmware_upload":
		// action_firmware_upload checks the file and links it as
		// /usr/local/.firmwareUpdate
		next := "firmware_update_invalid"
		stage := func(file string) {
			if c.FirmwareStagedLink != "" {
				os.Remove(c.FirmwareStagedLink)
				_ = os.Symlink(file, c.FirmwareStagedLink)
			}
		}
		filename := r.FormValue("filename")
		if r.FormValue("directDownload") == "true" {
			// The file CCU.downloadFirmware stored
			if data, err := os.ReadFile(c.FirmwareDownloadFile); err == nil && strings.Contains(string(data), FakeFirmware) {
				c.stagedFirmware = string(data)
				next = "askCreateBackup"
				stage(c.FirmwareDownloadFile)
			} else {
				os.Remove(c.FirmwareDownloadFile)
			}
		} else if filename == fakeTempFile && strings.Contains(c.tempUpload, FakeFirmware) {
			c.stagedFirmware = c.tempUpload
			next = "askCreateBackup"
		} else if data, err := os.ReadFile(filename); filename != fakeTempFile && err == nil {
			// A file on the CCU's own disk, checked where it is; the WebUI
			// deletes an invalid one
			if strings.Contains(string(data), FakeFirmware) {
				c.stagedFirmware = string(data)
				next = "askCreateBackup"
				stage(filename)
			} else {
				os.Remove(filename)
			}
		}
		c.tempUpload = ""
		_, _ = fmt.Fprintf(w, `<script>dlgPopup.LoadFromFile(url, "action=%s");</script>`, next)
	case "update_start":
		if c.stagedFirmware != "" {
			c.installedFirmware, c.stagedFirmware = c.stagedFirmware, ""
			c.rebooted = true
		}
	case "firmware_update_cancel":
		// Removes the linked file, the link and a direct download
		c.stagedFirmware = ""
		if c.FirmwareStagedLink != "" {
			if target, err := os.Readlink(c.FirmwareStagedLink); err == nil {
				os.Remove(target)
			}
			os.Remove(c.FirmwareStagedLink)
		}
		if c.FirmwareDownloadFile != "" {
			os.Remove(c.FirmwareDownloadFile)
		}
	}
}

// The fake's add-ons: FakeAddon installs without reboot, with
// FakeAddonReboot in it the CCU reboots, anything else fails
const (
	FakeAddon       = "fake CCU add-on"
	FakeAddonReboot = "needs a reboot"
)

// handleSoftware answers cp_software.cgi's install steps; install_go as
// /bin/install_addon's exit status decides
func (c *CCU) handleSoftware(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") {
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	switch r.FormValue("action") {
	case "image_upload":
		if r.FormValue("filename") == fakeTempFile {
			c.newAddon, c.tempUpload = c.tempUpload, ""
		}
		_, _ = io.WriteString(w, `<script>dlgPopup.LoadFromFile(url, "action=install_confirm");</script>`)
	case "install_go":
		addon := c.newAddon
		c.newAddon = ""
		switch {
		case !strings.Contains(addon, FakeAddon):
			_, _ = io.WriteString(w, `<div class="popupTitle">Error (2)</div>${dialogSettingsExtraSoftwareHintPerformInstallationFailure}`)
		case strings.Contains(addon, FakeAddonReboot):
			c.installedAddons = append(c.installedAddons, addon)
			c.rebooted = true
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsExtraSoftwareHintPerformInstallationTitle}</div>${dialogSettingsExtraSoftwareHintPerformInstallationContent}`)
		default:
			c.installedAddons = append(c.installedAddons, addon)
			_, _ = io.WriteString(w, `<div class="popupTitle">${dialogSettingsExtraSoftwareHintPerformInstallationTitle}</div>${dialogSettingsExtraSoftwareHintPerformInstallationContentNoReboot}`)
		}
	}
}

// InstalledAddons returns the add-on files installed
func (c *CCU) InstalledAddons() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.installedAddons...)
}

// InstalledFirmware returns the firmware file the CCU rebooted to install
// SetDeviceField changes a field of a device description, e.g. the
// AVAILABLE_FIRMWARE the CCU offers it
func (c *CCU) SetDeviceField(iface, address, field string, value any) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	data := c.fixture.Interfaces[iface]
	if data == nil {
		return false
	}
	for _, d := range data.Devices {
		if d["ADDRESS"] == address {
			d[field] = value
			return true
		}
	}
	return false
}

func (c *CCU) InstalledFirmware() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.installedFirmware
}

// RestoredBackup returns the backup restored and whether the CCU rebooted
func (c *CCU) RestoredBackup() (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.restoredBackup, c.rebooted
}
