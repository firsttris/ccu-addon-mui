package fakeccu

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Device firmware as the HMServer's device firmware page keeps it
// (DeviceFirmwareController): addFirmware unpacks a .tgz with an info file
// to ConfigDir/firmware/<TypeCode>, deleteFirmware removes it; the
// interface processes then offer it to the devices whose type the info
// file names (refreshDeployedDeviceFirmwareList). Next to it the fake
// stands in for eQ-3's update server, which lists the newest firmware and
// serves it (FirmwareCatalog).

// FirmwareCatalog is what the fake update server offers, by device type as
// eQ-3 names it
var FirmwareCatalog = map[string]string{
	"HmIP-WRC2":        "1.6.4",
	"HM-TC-IT-WM-W-EU": "1.5",
	"HmIP-HAP":         "2.4.0",
}

// The keys an info file needs (DeviceFirmwareController.isInfoFileValid)
var firmwareInfoKeys = []string{"TypeCode", "Name", "CCUFirmwareVersionMin", "CCU3FirmwareVersionMin", "FirmwareVersion"}

// FirmwareArchive builds a device firmware .tgz as eQ-3 ships it: an info
// file, a changelog and the image
func FirmwareArchive(deviceType, version string) []byte {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	// The hardware type code; the fake derives one from the name
	h := fnv.New32a()
	_, _ = h.Write([]byte(deviceType))
	typeCode := fmt.Sprintf("0x%x", h.Sum32()&0xffff)
	files := []struct{ name, content string }{
		{"info", fmt.Sprintf("# %s\nTypeCode=%s\nName=%s\nCCUFirmwareVersionMin=2.29.0\nCCU3FirmwareVersionMin=3.41.0\nFirmwareVersion=%s\n",
			deviceType, typeCode, deviceType, version)},
		{"changelog.txt", "Version " + version + "\n- Verbesserte Funkkommunikation\n"},
		{strings.ToLower(deviceType) + "_update_V" + strings.ReplaceAll(version, ".", "_") + ".eq3", "firmware image"},
	}
	for _, f := range files {
		_ = tw.WriteHeader(&tar.Header{Name: f.name, Mode: 0o644, Size: int64(len(f.content))})
		_, _ = tw.Write([]byte(f.content))
	}
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}

func (c *CCU) firmwareDir() string {
	return filepath.Join(c.ConfigDir, "firmware")
}

// handleUpdateServer answers as eQ-3's update server
func (c *CCU) handleUpdateServer(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	c.calls["update server "+r.URL.Path]++
	c.mu.Unlock()
	switch r.URL.Path {
	case "/firmware/api/firmware/search/DEVICE":
		entries := []map[string]string{}
		for deviceType, version := range FirmwareCatalog {
			entries = append(entries, map[string]string{"type": deviceType, "version": version})
		}
		data, _ := json.Marshal(entries)
		w.Header().Set("Content-Type", "text/javascript")
		fmt.Fprintf(w, "homematic.com.setDeviceFirmwareVersions(%s);", data)
	case "/firmware/download":
		product := r.URL.Query().Get("product")
		version, ok := FirmwareCatalog[product]
		if !ok || r.URL.Query().Get("cmd") != "download" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/gzip")
		_, _ = w.Write(FirmwareArchive(product, version))
	default:
		http.NotFound(w, r)
	}
}

// handleDeviceFirmware is the HMServer's device firmware page
func (c *CCU) handleDeviceFirmware(w http.ResponseWriter, r *http.Request) {
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") {
		// FirmwareUploadRouteHandler: invalid session
		w.WriteHeader(http.StatusForbidden)
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls["HMServer "+strings.TrimPrefix(r.URL.Path, "/pages/jpages/system/DeviceFirmware/")]++
	switch strings.TrimPrefix(r.URL.Path, "/pages/jpages/system/DeviceFirmware/") {
	case "addFirmware":
		w.Header().Set("Content-Type", "text/html")
		file, header, err := r.FormFile("file")
		if err != nil {
			_, _ = io.WriteString(w, "${addDevFirmwareFailed}")
			return
		}
		defer file.Close()
		name := strings.ToLower(header.Filename)
		if !strings.HasSuffix(name, ".tgz") && !strings.HasSuffix(name, ".tar.gz") {
			_, _ = io.WriteString(w, "${addDevFirmwareInvalid}")
			return
		}
		_, _ = io.WriteString(w, c.addFirmware(file))
	case "deleteFirmware":
		var params map[string]string
		_ = json.NewDecoder(r.Body).Decode(&params)
		id := params["firmwareID"]
		dir := filepath.Join(c.firmwareDir(), id)
		ok := id != "" && !strings.ContainsAny(id, "/\\") && id != ".." && os.RemoveAll(dir) == nil
		content := "${delDevFirmwareFailed}"
		if ok {
			content = params["deviceName"] + " deleted"
		}
		// isSuccessful either way, as JsonResponseFactory.getValidResponse
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"isSuccessful": true, "errorCode": "", "content": content})
	default:
		http.NotFound(w, r)
	}
}

// addFirmware unpacks an archive like DeviceFirmwareController.addFirmware
func (c *CCU) addFirmware(file io.Reader) string {
	gz, err := gzip.NewReader(file)
	if err != nil {
		return "${addDevFirmwareInvalid}"
	}
	tr := tar.NewReader(gz)
	contents := map[string][]byte{}
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "${addDevFirmwareInvalid}"
		}
		if h.Typeflag != tar.TypeReg || strings.Contains(h.Name, "..") {
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(tr, 32<<20))
		contents[filepath.Base(h.Name)] = data
	}
	info := parseFirmwareInfo(string(contents["info"]))
	for _, key := range firmwareInfoKeys {
		if info[key] == "" {
			return "${addDevFirmwareInfoCorrupt}"
		}
	}
	dir := filepath.Join(c.firmwareDir(), info["TypeCode"])
	_ = os.RemoveAll(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "${addDevFirmwareFailed}"
	}
	for name, data := range contents {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			return "${addDevFirmwareFailed}"
		}
	}
	return "${addDevFirmwareSuccess}"
}

func parseFirmwareInfo(text string) map[string]string {
	info := map[string]string{}
	for _, line := range strings.Split(text, "\n") {
		parts := strings.Split(line, "=")
		if len(parts) == 2 && !strings.Contains(line, "#") {
			info[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return info
}

// refreshFirmware offers the firmware in the directory to the devices of
// an interface: AVAILABLE_FIRMWARE, and for HmIP a delivered update (the
// fake skips the hours of DELIVER_FIRMWARE_IMAGE)
func (c *CCU) refreshFirmware(iface string, data *InterfaceData) {
	entries, _ := os.ReadDir(c.firmwareDir())
	versions := map[string]string{}
	for _, e := range entries {
		raw, err := os.ReadFile(filepath.Join(c.firmwareDir(), e.Name(), "info"))
		if err != nil {
			continue
		}
		info := parseFirmwareInfo(string(raw))
		versions[strings.ToLower(info["Name"])] = info["FirmwareVersion"]
	}
	for _, d := range data.Devices {
		if d["PARENT"] != nil && d["PARENT"] != "" {
			continue
		}
		deviceType, _ := d["TYPE"].(string)
		version, ok := versions[strings.ToLower(deviceType)]
		if !ok || version == d["FIRMWARE"] {
			continue
		}
		d["AVAILABLE_FIRMWARE"] = version
		if iface == "HmIP-RF" || iface == "HmIP-Wired" {
			d["FIRMWARE_UPDATE_STATE"] = "READY_FOR_UPDATE"
		}
	}
}
