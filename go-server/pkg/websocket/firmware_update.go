package websocket

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
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
	// The CCU can download the update itself (downloadCcuFirmware), and
	// the room it has on its user partition, for information: the WebUI's
	// 2.8 GB (cp_maintenance.cgi, USERFSFREE_MB_REQ) is more than a CCU3's
	// whole partition, and updates there work with less; whether the
	// update fits is checked by the recovery system (fwinstall.sh: the
	// unpacked image must fit into what is left after the download)
	DirectDownload bool `json:"directDownload"`
	FreeMB         int  `json:"freeMb,omitempty"`
}

var (
	errDirectDownloadUnsupported = errors.New("this CCU can't download its firmware itself")
	errFirmwareChecksum          = errors.New("the downloaded firmware does not match its SHA256 checksum")
	errFirmwareNotStaged         = errors.New("no checked firmware is ready to install")
)

// freeMB is the free space of a directory in MB
var freeMB = func(dir string) int {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0
	}
	return int(st.Bavail * uint64(st.Bsize) / (1 << 20))
}

// directDownloadPlatform: the platform whose release the CCU downloads,
// "" where it can't: OpenCCU offers the direct download except in
// containers (cp_maintenance.cgi: get_platform != oci, lxc), which update
// their image instead
func directDownloadPlatform() string {
	platform := versionFileValue("PLATFORM")
	if platform == "oci" || platform == "lxc" {
		return ""
	}
	return platform
}

var sha256Regex = regexp.MustCompile(`^([0-9a-fA-F]{64})\b`)

// firmwareDownloadCheck prepares downloadCcuFirmware: enough room, and
// the SHA256 checksum of the release that CCU.downloadFirmware fetches
// (OpenCCU-<latest>-<platform>.zip). It returns the check of the
// downloaded file, as checkFirmwareUpdate.sh does it.
func (s *Server) firmwareDownloadCheck() (func() error, error) {
	platform := directDownloadPlatform()
	current := firmwareVersion()
	if platform == "" || current == "" {
		return nil, errDirectDownloadUnsupported
	}
	latest, err := latestFirmware(current)
	if err != nil {
		return nil, err
	}
	name := "OpenCCU-" + latest + "-" + platform + ".zip"
	resp, err := firmwareUpdateClient.Get(s.cfg.CcuFirmwareReleases + "/" + url.PathEscape(latest) + "/" + url.PathEscape(name) + ".sha256")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("no checksum for %s (status %d)", name, resp.StatusCode)
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1000))
	match := sha256Regex.FindSubmatch(body)
	if match == nil {
		return nil, fmt.Errorf("unexpected checksum file for %s", name)
	}
	want := strings.ToLower(string(match[1]))
	file := s.cfg.FirmwareDownloadFile
	return func() error {
		f, err := os.Open(file)
		if err != nil {
			return err
		}
		h := sha256.New()
		_, err = io.Copy(h, f)
		f.Close()
		if err != nil {
			return err
		}
		if hex.EncodeToString(h.Sum(nil)) != want {
			os.Remove(file)
			return errFirmwareChecksum
		}
		return nil
	}, nil
}

// handleFirmwareUpdate: the newest firmware for the CCU, for
// administrators, as the WebUI's start page shows it, and whether the CCU
// can download it itself (downloadCcuFirmware, in handleRestore).
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
	response := firmwareUpdateResponse{Type: "checkFirmwareUpdate_response", RequestID: requestID, Current: current, Latest: latest}
	if directDownloadPlatform() != "" && s.backup != nil {
		response.DirectDownload = true
		response.FreeMB = freeMB(s.cfg.UserFSDir)
	}
	s.sendJSON(client, response)
}

// onCCU: the server runs on the CCU itself (it has the firmware's /VERSION),
// not on a PC that talks to a CCU over the network
func onCCU() bool {
	return firmwareVersion() != ""
}

// removeUnstagedDownload removes what CCU.downloadFirmware left after a
// failed direct download; one the WebUI linked for the update stays
func (s *Server) removeUnstagedDownload() {
	if target, err := filepath.EvalSymlinks(s.cfg.FirmwareStagedLink); err == nil && target == s.cfg.FirmwareDownloadFile {
		return
	}
	os.Remove(s.cfg.FirmwareDownloadFile)
}

// firmwareStaged: the link the recovery system installs from points to an
// existing file; after a reboot /usr/local/tmp is empty (S06InitSystem)
// and the link dangles
func (s *Server) firmwareStaged() bool {
	target, err := filepath.EvalSymlinks(s.cfg.FirmwareStagedLink)
	if err != nil {
		return false
	}
	info, err := os.Stat(target)
	return err == nil && (info.Mode().IsRegular() || info.IsDir())
}
