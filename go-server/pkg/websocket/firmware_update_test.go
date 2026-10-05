package websocket

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
)

func TestFirmwareUpdateURL(t *testing.T) {
	if got := firmwareUpdateURL("3.89.11", "raspmatic_rpi4", "rpi4"); got != "https://openccu.de/LATEST-VERSION.js?v=3.89.11&p=raspmatic_rpi4" {
		t.Fatalf("OpenCCU URL = %q", got)
	}
	if got := firmwareUpdateURL("3.79.6", "ccu3", ""); !strings.Contains(got, "update.homematic.com") || !strings.Contains(got, "version=3.79.6") {
		t.Fatalf("CCU3 URL = %q", got)
	}
}

func TestHandleFirmwareUpdate(t *testing.T) {
	file := filepath.Join(t.TempDir(), "VERSION")
	_ = os.WriteFile(file, []byte("VERSION=3.89.10\nPRODUCT=raspmatic_rpi4\nPLATFORM=rpi4\n"), 0o644)
	previousFile, previousURL := firmwareVersionFile, firmwareUpdateURL
	defer func() { firmwareVersionFile, firmwareUpdateURL = previousFile, previousURL }()
	firmwareVersionFile = file

	answer := "homematic.com.setLatestVersion('3.89.11.20260919', 'HM-RASPBERRYMATIC');"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("p") != "raspmatic_rpi4" {
			t.Errorf("unexpected query %q", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(answer))
	}))
	defer upstream.Close()
	firmwareUpdateURL = func(version, product, platform string) string {
		return upstream.URL + "/LATEST-VERSION.js?v=" + version + "&p=" + product
	}

	s := NewServer(nil, nil)
	check := func(level string) map[string]interface{} {
		client := &Client{send: make(chan []byte, 1), level: level}
		s.handleFirmwareUpdate(client, "r")
		var m map[string]interface{}
		_ = json.Unmarshal(<-client.send, &m)
		return m
	}
	if m := check(auth.LevelAdmin); m["current"] != "3.89.10" || m["latest"] != "3.89.11.20260919" {
		t.Fatalf("unexpected answer: %v", m)
	}
	if m := check(auth.LevelUser); m["code"] != "FORBIDDEN" {
		t.Fatalf("users may not check: %v", m)
	}
	answer = "<html>maintenance</html>"
	if m := check(auth.LevelAdmin); m["code"] != "CCU_ERROR" {
		t.Fatalf("expected CCU_ERROR for a strange answer, got %v", m)
	}
	firmwareVersionFile = filepath.Join(t.TempDir(), "missing")
	if m := check(auth.LevelAdmin); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED without a version, got %v", m)
	}
}

// The CCU downloads its update itself (OpenCCU's CCU.downloadFirmware), the
// server checks the release's SHA256 checksum, the WebUI links the file
func TestDownloadCcuFirmware(t *testing.T) {
	dir := t.TempDir()
	versionFile := filepath.Join(dir, "VERSION")
	_ = os.WriteFile(versionFile, []byte("VERSION=3.89.10.20260901\nPRODUCT=raspmatic_rpi4\nPLATFORM=rpi4\n"), 0o644)
	previousFile, previousURL, previousFree := firmwareVersionFile, firmwareUpdateURL, freeMB
	defer func() { firmwareVersionFile, firmwareUpdateURL, freeMB = previousFile, previousURL, previousFree }()
	firmwareVersionFile = versionFile
	free := 5000
	freeMB = func(string) int { return free }

	const latest = "3.89.11.20260919"
	checksum := sha256.Sum256([]byte(fakeccu.FakeFirmwareDownload))
	sha := hex.EncodeToString(checksum[:])
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/LATEST-VERSION.js":
			_, _ = w.Write([]byte("homematic.com.setLatestVersion('" + latest + "', 'HM-RASPBERRYMATIC');"))
		case "/releases/" + latest + "/OpenCCU-" + latest + "-rpi4.zip.sha256":
			_, _ = w.Write([]byte(sha + "  OpenCCU-" + latest + "-rpi4.zip\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	firmwareUpdateURL = func(version, product, platform string) string { return upstream.URL + "/LATEST-VERSION.js" }

	fixture, err := fakeccu.LoadFixture("../../../fixtures/demo-ccu.json")
	if err != nil {
		t.Fatal(err)
	}
	ccu := fakeccu.New(fixture)
	if err := ccu.Start("127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	defer ccu.Close()
	ccu.FirmwareDownloadFile = filepath.Join(dir, "firmwareUpdateFile")

	cfg := &config.Config{UserFSDir: dir, FirmwareDownloadFile: ccu.FirmwareDownloadFile, CcuFirmwareReleases: upstream.URL + "/releases"}
	s := NewServer(cfg, nil)
	s.SetBackup(backup.New(fmt.Sprintf("http://127.0.0.1:%d", ccu.WebUIPort), filepath.Join(dir, "backups")))
	client := &Client{send: make(chan []byte, 4), level: auth.LevelAdmin, user: "Admin", elevatedUntil: time.Now().Add(time.Hour)}
	call := func(m map[string]interface{}) map[string]interface{} {
		t.Helper()
		data, _ := json.Marshal(m)
		s.handleMessage(client, data)
		var answer map[string]interface{}
		_ = json.Unmarshal(<-client.send, &answer)
		return answer
	}

	if m := call(map[string]interface{}{"type": "checkFirmwareUpdate", "requestId": "c"}); m["latest"] != latest || m["directDownload"] != true ||
		m["freeMb"] != float64(5000) || m["requiredMb"] != float64(2868) {
		t.Fatalf("unexpected check: %v", m)
	}

	// The room OpenCCU wants on /usr/local
	free = 2000
	if m := call(map[string]interface{}{"type": "downloadCcuFirmware", "requestId": "d1", "password": "secret"}); m["code"] != "NOT_ENOUGH_SPACE" {
		t.Fatalf("expected NOT_ENOUGH_SPACE, got %v", m)
	}
	// Uploading a downloaded file needs the same room (cp_maintenance.cgi
	// greys out both): refused before the browser sends it
	if m := call(map[string]interface{}{"type": "prepareCcuFirmware", "requestId": "p1"}); m["code"] != "NOT_ENOUGH_SPACE" {
		t.Fatalf("expected NOT_ENOUGH_SPACE for an upload, got %v", m)
	}
	free = 5000
	if m := call(map[string]interface{}{"type": "prepareCcuFirmware", "requestId": "p2"}); m["success"] != true {
		t.Fatalf("expected the upload to be prepared with enough room, got %v", m)
	}
	if m := call(map[string]interface{}{"type": "downloadCcuFirmware", "requestId": "d2", "password": "falsch"}); m["code"] != "INVALID_CREDENTIALS" {
		t.Fatalf("expected INVALID_CREDENTIALS, got %v", m)
	}
	m := call(map[string]interface{}{"type": "downloadCcuFirmware", "requestId": "d3", "password": "secret", "language": "de"})
	if m["success"] != true || m["eula"] != "Lizenzbedingungen der Fake-Firmware" {
		t.Fatalf("download failed: %v", m)
	}
	if n := ccu.CallCount("JSON-RPC CCU.downloadFirmware"); n != 1 {
		t.Fatalf("expected one download, got %d", n)
	}
	if m := call(map[string]interface{}{"type": "installCcuFirmware", "requestId": "i", "password": "secret"}); m["success"] != true ||
		ccu.InstalledFirmware() != fakeccu.FakeFirmwareDownload {
		t.Fatalf("not installed: %v %q", m, ccu.InstalledFirmware())
	}

	// A file that doesn't match the checksum is removed, not installed
	sha = strings.Repeat("0", 64)
	if m := call(map[string]interface{}{"type": "downloadCcuFirmware", "requestId": "d4", "password": "secret"}); m["code"] != "FIRMWARE_CHECKSUM" {
		t.Fatalf("expected FIRMWARE_CHECKSUM, got %v", m)
	}
	if _, err := os.Stat(ccu.FirmwareDownloadFile); !os.IsNotExist(err) {
		t.Fatal("a file with the wrong checksum must be removed")
	}

	// Containers update their image
	_ = os.WriteFile(versionFile, []byte("VERSION=3.89.10.20260901\nPRODUCT=openccu_oci_arm64\nPLATFORM=oci\n"), 0o644)
	if m := call(map[string]interface{}{"type": "checkFirmwareUpdate", "requestId": "c2"}); m["directDownload"] != false {
		t.Fatalf("containers can't download: %v", m)
	}
	if m := call(map[string]interface{}{"type": "downloadCcuFirmware", "requestId": "d5", "password": "secret"}); m["code"] != "NOT_SUPPORTED" {
		t.Fatalf("expected NOT_SUPPORTED, got %v", m)
	}
}
