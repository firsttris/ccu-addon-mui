package websocket

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
)

// Device firmware: what is on the CCU (/etc/config/firmware), the newest
// versions eQ-3 offers, and getting one onto the CCU without the detour
// over the user's computer. The WebUI only links to eQ-3's download and
// has the file uploaded again on its device firmware page; here the server
// downloads it and hands it to the HMServer itself.

var deviceFirmwareClient = &http.Client{Timeout: 2 * time.Minute}

// The list of versions has to come within the browser's wait for it
var deviceFirmwareCatalogClient = &http.Client{Timeout: 25 * time.Second}

// How long eQ-3's list of device firmware is kept
const deviceFirmwareCatalogLifetime = time.Hour

// DeviceFirmwareVersion is the newest firmware eQ-3 offers for a device
// type; Type is the device type as the CCU names it, in lower case
type DeviceFirmwareVersion struct {
	Type    string `json:"type"`
	Version string `json:"version"`
}

// catalogTypes are the device types an entry of eQ-3's list stands for,
// in lower case, as webui.js fetchAndSetDeviceVersion maps them: the last
// "_" becomes a space (SPHM-1039), HmIP-HAP-JS1 is "HmIP-HAP JS1"
// (SPHM-1034) and HmIP-HAP serves the HAP-B1 too (SPHM-1022)
func catalogTypes(eq3Type string) []string {
	t := strings.ToLower(eq3Type)
	if i := strings.LastIndex(t, "_"); i >= 0 {
		t = t[:i] + " " + t[i+1:]
	}
	switch eq3Type {
	case "HmIP-HAP-JS1":
		return []string{"hmip-hap js1"}
	case "HmIP-HAP":
		return []string{t, "hmip-hap-b1"}
	}
	return []string{t}
}

// downloadProduct is the product name eQ-3's download takes for a device
// type (webui.js setDeviceVersion: deviceTypeForUrl)
func downloadProduct(deviceType string) string {
	switch deviceType {
	case "HmIP-HAP JS1":
		return "HmIP-HAP-JS1"
	case "HmIP-HAP-B1":
		return "HmIP-HAP"
	}
	if i := strings.LastIndex(deviceType, " "); i >= 0 {
		return deviceType[:i] + "_" + deviceType[i+1:]
	}
	return deviceType
}

// The list comes as JSONP: homematic.com.setDeviceFirmwareVersions([...])
var catalogRegex = regexp.MustCompile(`(?s)setDeviceFirmwareVersions\((.*)\)`)

// fetchDeviceFirmwareCatalog asks eQ-3 for the newest device firmware, as
// webui.js getListOfAvailableFirmware does
func (s *Server) fetchDeviceFirmwareCatalog() ([]DeviceFirmwareVersion, error) {
	return s.deviceFirmwareCatalog.get(deviceFirmwareCatalogLifetime, func() ([]DeviceFirmwareVersion, error) {
		return readDeviceFirmwareCatalog(s.cfg.DeviceFirmwareServer)
	})
}

// readDeviceFirmwareCatalog reads eQ-3's list from server
func readDeviceFirmwareCatalog(server string) ([]DeviceFirmwareVersion, error) {
	u := server + "/firmware/api/firmware/search/DEVICE?product=HM-CCU3&version=" +
		url.QueryEscape(firmwareVersion())
	resp, err := deviceFirmwareCatalogClient.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("the update server returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	match := catalogRegex.FindSubmatch(body)
	if match == nil {
		return nil, errors.New("unexpected answer from the update server")
	}
	var entries []struct {
		Type    string `json:"type"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal(match[1], &entries); err != nil {
		return nil, fmt.Errorf("unexpected answer from the update server: %w", err)
	}
	versions := []DeviceFirmwareVersion{}
	for _, e := range entries {
		if e.Type == "" || e.Version == "" || e.Version == "n/a" {
			continue
		}
		for _, t := range catalogTypes(e.Type) {
			versions = append(versions, DeviceFirmwareVersion{Type: t, Version: e.Version})
		}
	}
	return versions, nil
}

// downloadDeviceFirmware fetches the newest firmware for a device type
// from eQ-3 (downloadURLServer + "&serial=0&product=..."): OpenCCU sends no
// serial number (0183-WebUI-ImprovedFirmwareupdateDialog, webui.js)
func (s *Server) downloadDeviceFirmware(deviceType string) (string, error) {
	u := s.cfg.DeviceFirmwareServer + "/firmware/download?cmd=download&serial=0" +
		"&product=" + url.QueryEscape(downloadProduct(deviceType))
	resp, err := deviceFirmwareClient.Get(u)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("the update server returned status %d", resp.StatusCode)
	}
	return s.backup.SaveDownload(resp.Body)
}

func (s *Server) deviceFirmwareDir() string {
	return filepath.Join(s.cfg.ConfigDir, "firmware")
}

// refreshDeviceFirmware lets the interface processes read the firmware
// directory again, as AvailableFirmware.ftl does after adding or deleting
func (s *Server) refreshDeviceFirmware() {
	if s.rpc == nil {
		return
	}
	for _, iface := range []string{"BidCos-RF", "HmIP-RF"} {
		if err := s.rpc.RefreshDeployedDeviceFirmwareList(iface); err != nil {
			logger.Debugf("refreshDeployedDeviceFirmwareList on %s failed: %v", iface, err)
		}
	}
}

type deviceFirmwareResponse struct {
	Type      string `json:"type"`
	RequestID string `json:"requestId,omitempty"`
	Success   bool   `json:"success"`
	// Pointers: an empty list is still sent, a missing one not
	Files     *[]backup.DeviceFirmware `json:"files,omitempty"`
	Versions  *[]DeviceFirmwareVersion `json:"versions,omitempty"`
	Changelog *string                  `json:"changelog,omitempty"`
}

// handleDeviceFirmware: getDeviceFirmware lists the firmware on the CCU,
// checkDeviceFirmware the newest versions at eQ-3,
// getDeviceFirmwareChangelog shows one's changelog (administrators);
// downloadDeviceFirmware, addDeviceFirmware (an upload prepared with
// prepareDeviceFirmwareUpload) and deleteDeviceFirmware change them:
// elevated, with audit log and a WebUI session for the HMServer.
func (s *Server) handleDeviceFirmware(client *Client, msgType string, message []byte) {
	var msg deviceFirmwareRequest
	if !s.decode(client, message, &msg) {
		return
	}
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, msg.RequestID, "only administrators may manage device firmware", "FORBIDDEN")
		return
	}
	response := deviceFirmwareResponse{Type: msgType + "_response", RequestID: msg.RequestID, Success: true}
	switch msgType {
	case "getDeviceFirmware":
		s.listDeviceFirmware(client, response)
	case "checkDeviceFirmware":
		s.checkDeviceFirmware(client, response)
	case "getDeviceFirmwareChangelog":
		s.deviceFirmwareChangelog(client, msg, response)
	default:
		if change, ok := deviceFirmwareChanges[msgType]; ok {
			s.changeDeviceFirmware(client, msgType, msg, change, response)
		}
	}
}

type deviceFirmwareRequest struct {
	RequestID  string `json:"requestId"`
	ID         string `json:"id"`
	DeviceType string `json:"deviceType"`
	FileName   string `json:"fileName"`
	Password   string `json:"password"`
}

func (s *Server) listDeviceFirmware(client *Client, response deviceFirmwareResponse) {
	files, err := backup.ListDeviceFirmware(s.deviceFirmwareDir())
	if err != nil {
		s.sendRequestError(client, response.RequestID, "getDeviceFirmware failed: "+err.Error(), "CCU_ERROR")
		return
	}
	response.Files = &files
	s.sendJSON(client, response)
}

func (s *Server) checkDeviceFirmware(client *Client, response deviceFirmwareResponse) {
	versions, err := s.fetchDeviceFirmwareCatalog()
	if err != nil {
		s.sendRequestError(client, response.RequestID, "checkDeviceFirmware failed: "+err.Error(), "UPDATE_SERVER_ERROR")
		return
	}
	response.Versions = &versions
	s.sendJSON(client, response)
}

func (s *Server) deviceFirmwareChangelog(client *Client, msg deviceFirmwareRequest, response deviceFirmwareResponse) {
	changelog, err := backup.DeviceFirmwareChangelog(s.deviceFirmwareDir(), msg.ID)
	if errors.Is(err, backup.ErrUploadNotFound) {
		s.sendRequestError(client, msg.RequestID, "no changelog", rega.SetNotFound)
		return
	}
	if err != nil {
		s.sendRequestError(client, msg.RequestID, "getDeviceFirmwareChangelog failed: "+err.Error(), "CCU_ERROR")
		return
	}
	response.Changelog = &changelog
	s.sendJSON(client, response)
}

// A change of the firmware files on the CCU, with the administrator's
// password (the WebUI's session); it may name its audit target better
type deviceFirmwareChange func(s *Server, msg deviceFirmwareRequest, username string, entry *audit.Entry) error

var (
	errInvalidDeviceType     = errors.New("invalid device type")
	errUpdateServer          = errors.New("update server")
	errUnknownDeviceFirmware = errors.New("unknown device firmware")
)

// The codes of the changes' own errors
var deviceFirmwareErrors = []errorCode{
	{errInvalidDeviceType, "INVALID_VALUE"},
	{errUpdateServer, "UPDATE_SERVER_ERROR"},
	{errUnknownDeviceFirmware, rega.SetNotFound},
}

var deviceFirmwareChanges = map[string]deviceFirmwareChange{
	"downloadDeviceFirmware": func(s *Server, msg deviceFirmwareRequest, username string, _ *audit.Entry) error {
		if msg.DeviceType == "" || len(msg.DeviceType) > 64 || strings.ContainsAny(msg.DeviceType, "/\\\"\r\n") {
			return errInvalidDeviceType
		}
		// The session first: no download for nothing
		if err := s.backup.EnsureSession(username, msg.Password); err != nil {
			return err
		}
		path, err := s.downloadDeviceFirmware(msg.DeviceType)
		if err != nil {
			return fmt.Errorf("%w: %v", errUpdateServer, err)
		}
		defer os.Remove(path)
		return s.backup.AddDeviceFirmware(username, msg.Password, path, downloadProduct(msg.DeviceType)+".tgz")
	},
	"addDeviceFirmware": func(s *Server, msg deviceFirmwareRequest, username string, _ *audit.Entry) error {
		path, err := s.backup.DeviceFirmwarePath(msg.ID)
		if err != nil {
			return err
		}
		err = s.backup.AddDeviceFirmware(username, msg.Password, path, msg.FileName)
		if !errors.Is(err, backup.ErrSessionRequired) {
			// Kept for the retry with the password
			s.backup.Discard(msg.ID)
		}
		return err
	},
	"deleteDeviceFirmware": func(s *Server, msg deviceFirmwareRequest, username string, entry *audit.Entry) error {
		files, err := backup.ListDeviceFirmware(s.deviceFirmwareDir())
		var name string
		for _, f := range files {
			if f.ID == msg.ID {
				name = f.Name
			}
		}
		if err != nil || name == "" {
			return errUnknownDeviceFirmware
		}
		entry.Target = name
		return s.backup.DeleteDeviceFirmware(username, msg.Password, msg.ID, name)
	},
}

// changeDeviceFirmware runs a change for an elevated administrator and
// answers with the firmware files as they are now
func (s *Server) changeDeviceFirmware(client *Client, msgType string, msg deviceFirmwareRequest, change deviceFirmwareChange, response deviceFirmwareResponse) {
	entry := audit.Entry{User: client.user, Action: msgType, Target: msg.ID}
	if msgType == "downloadDeviceFirmware" {
		entry.Target = msg.DeviceType
	}
	if !s.mayConfigure(client, msg.RequestID, entry) {
		return
	}
	if s.backup == nil {
		s.recordAudit(entry, "NOT_SUPPORTED")
		s.sendRequestError(client, msg.RequestID, msgType+" needs the WebUI", "NOT_SUPPORTED")
		return
	}
	username := client.user
	if s.auth == nil {
		username = "Admin"
	}
	if err := change(s, msg, username, &entry); err != nil {
		s.failChange(client, msg.RequestID, entry, err, deviceFirmwareErrors...)
		return
	}
	s.recordAudit(entry, rega.SetOK)
	s.refreshDeviceFirmware()
	if files, err := backup.ListDeviceFirmware(s.deviceFirmwareDir()); err == nil {
		response.Files = &files
	}
	s.sendJSON(client, response)
}
