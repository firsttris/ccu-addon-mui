package websocket

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"ccu-addon-mui-server/pkg/auth"
)

// firmwareUpdateURL is where the WebUI asks for the newest firmware
// (webui.js, homematic.com.init): OpenCCU, whose VERSION file has a
// PLATFORM line (board/post-build.sh), loads openccu.de/LATEST-VERSION.js;
// an original CCU3 asks eQ-3's update server.
var firmwareUpdateURL = func(version, product, platform string) string {
	if platform != "" {
		return "https://openccu.de/LATEST-VERSION.js?v=" + url.QueryEscape(version) + "&p=" + url.QueryEscape(product)
	}
	return "https://ccu3-update.homematic.com:8443/firmware/download?cmd=js_check_version&version=" +
		url.QueryEscape(version) + "&product=HM-CCU3&serial=0"
}

var firmwareUpdateClient = &http.Client{Timeout: 15 * time.Second}

// Both servers answer homematic.com.setLatestVersion('3.89.11', '...');
var latestVersionRegex = regexp.MustCompile(`setLatestVersion\(\s*'([0-9A-Za-z._-]{1,40})'`)

// latestFirmware asks the update server for the newest firmware version
func latestFirmware(version string) (string, error) {
	resp, err := firmwareUpdateClient.Get(firmwareUpdateURL(version, versionFileValue("PRODUCT"), versionFileValue("PLATFORM")))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("update check returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1000))
	if err != nil {
		return "", err
	}
	match := latestVersionRegex.FindSubmatch(body)
	if match == nil {
		return "", fmt.Errorf("unexpected answer from the update check")
	}
	return string(match[1]), nil
}

type firmwareUpdateResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Current   string `json:"current"`
	Latest    string `json:"latest"`
}

// handleFirmwareUpdate: the newest firmware for the CCU, for
// administrators, as the WebUI's start page shows it. Updating stays in
// the WebUI (Zentralen-Firmware aktualisieren).
func (s *Server) handleFirmwareUpdate(client *Client, requestID string) {
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may check for updates", "FORBIDDEN")
		return
	}
	current := firmwareVersion()
	if current == "" {
		s.sendRequestError(client, requestID, "the firmware version is unknown", "NOT_SUPPORTED")
		return
	}
	latest, err := latestFirmware(current)
	if err != nil {
		s.sendRequestError(client, requestID, "update check failed: "+err.Error(), "CCU_ERROR")
		return
	}
	s.sendJSON(client, firmwareUpdateResponse{Type: "checkFirmwareUpdate_response", RequestID: requestID, Current: current, Latest: latest})
}
