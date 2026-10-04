package backup

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Device firmware goes through the HMServer's device firmware page, as the
// WebUI's AvailableFirmware.ftl uses it: addFirmware takes a .tgz
// (FirmwareUploadRouteHandler), checks its info file and unpacks it to
// /etc/config/firmware/<TypeCode> (DeviceFirmwareController), deleteFirmware
// removes such a directory. Both need a WebUI session. Afterwards the
// interface processes read the directory again
// (refreshDeployedDeviceFirmwareList), which the caller does.

var (
	// ErrInvalidDeviceFirmware: no device firmware archive, or its info
	// file is missing or incomplete (addDevFirmwareInvalid,
	// addDevFirmwareInfoCorrupt, addFirmwareFailedNotValidatable)
	ErrInvalidDeviceFirmware = errors.New("invalid device firmware")
	// ErrDeviceFirmwareNeedsNewerCCU: the firmware needs a newer CCU
	// firmware (addFirmwareFailedMinCCUVersion)
	ErrDeviceFirmwareNeedsNewerCCU = errors.New("the device firmware needs a newer CCU firmware")
	// ErrDeviceFirmwareFailed: the HMServer could not store it
	ErrDeviceFirmwareFailed = errors.New("the HMServer did not take the device firmware")
)

// The largest device firmware archive taken; eQ-3's are well below 2 MB,
// access point and wired gateway images a few MB
const maxDeviceFirmwareSize = 32 << 20

// DeviceFirmware is a firmware file on the CCU (the info file of a
// directory in /etc/config/firmware, DeviceFirmwareController.readInfoFile)
type DeviceFirmware struct {
	// The directory name, the HMServer's firmwareID
	ID       string `json:"id"`
	Name     string `json:"name"`
	TypeCode string `json:"typeCode"`
	Version  string `json:"version"`
	// The CCU3 firmware it needs (CCU3FirmwareVersionMin)
	MinCCUVersion string `json:"minCcuVersion,omitempty"`
	// Whether it has a changelog.txt
	Changelog bool `json:"changelog"`
}

var deviceFirmwareIDRegex = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// readInfo reads key=value lines, without those holding a "#" (readInfoFile)
func readInfo(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), "=")
		if len(parts) != 2 || strings.Contains(scanner.Text(), "#") {
			continue
		}
		info[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	return info, scanner.Err()
}

// ListDeviceFirmware lists the device firmware in dir (/etc/config/firmware)
// as the device firmware page does; directories without a usable info file
// are left out (OpenCCU's S62HMServer removes those at start)
func ListDeviceFirmware(dir string) ([]DeviceFirmware, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []DeviceFirmware{}, nil
	}
	if err != nil {
		return nil, err
	}
	list := []DeviceFirmware{}
	for _, entry := range entries {
		if !entry.IsDir() || !deviceFirmwareIDRegex.MatchString(entry.Name()) {
			continue
		}
		info, err := readInfo(filepath.Join(dir, entry.Name(), "info"))
		if err != nil || info["Name"] == "" {
			continue
		}
		_, changelogErr := os.Stat(filepath.Join(dir, entry.Name(), "changelog.txt"))
		list = append(list, DeviceFirmware{
			ID:            entry.Name(),
			Name:          info["Name"],
			TypeCode:      info["TypeCode"],
			Version:       info["FirmwareVersion"],
			MinCCUVersion: info["CCU3FirmwareVersionMin"],
			Changelog:     changelogErr == nil,
		})
	}
	sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name) })
	return list, nil
}

// DeviceFirmwareChangelog returns the changelog of a device firmware
// (DeviceFirmwareController.getChangelog)
func DeviceFirmwareChangelog(dir, id string) (string, error) {
	if !deviceFirmwareIDRegex.MatchString(id) || strings.Contains(id, "..") {
		return "", ErrUploadNotFound
	}
	data, err := os.ReadFile(filepath.Join(dir, id, "changelog.txt"))
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrUploadNotFound
	}
	if err != nil {
		return "", err
	}
	if len(data) > 256<<10 {
		data = data[:256<<10]
	}
	return string(data), nil
}

// CheckDeviceFirmwareArchive tells whether a file is a gzip archive at
// all, before it goes to the HMServer
func CheckDeviceFirmwareArchive(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := gzip.NewReader(file); err != nil {
		return ErrInvalidDeviceFirmware
	}
	return nil
}

// EnsureSession makes sure there is a WebUI session for the user before a
// longer step (a download) that needs one afterwards
func (s *Service) EnsureSession(username, password string) error {
	_, err := s.groupSession(username, password)
	return err
}

// DeviceFirmwarePath is an uploaded device firmware file
func (s *Service) DeviceFirmwarePath(id string) (string, error) {
	return s.uploadPath(id)
}

// AddDeviceFirmware hands a device firmware archive to the HMServer
// (/pages/jpages/system/DeviceFirmware/addFirmware, multipart field
// "file"), with the user's WebUI session
func (s *Service) AddDeviceFirmware(username, password, path, fileName string) error {
	if err := CheckDeviceFirmwareArchive(path); err != nil {
		return err
	}
	// The HMServer only takes .tgz and .tar.gz (isValidFilename)
	lower := strings.ToLower(fileName)
	if !strings.HasSuffix(lower, ".tgz") && !strings.HasSuffix(lower, ".tar.gz") {
		fileName = "firmware.tgz"
	}
	sessionID, err := s.groupSession(username, password)
	if err != nil {
		return err
	}
	answer, status, err := s.uploadDeviceFirmware(sessionID, path, fileName)
	if err != nil {
		return err
	}
	if status == http.StatusForbidden {
		// Invalid session: the HMServer closes the connection
		s.forgetGroupSession(username)
		return ErrSessionRequired
	}
	if status != http.StatusOK {
		return fmt.Errorf("%w: status %d", ErrDeviceFirmwareFailed, status)
	}
	switch {
	case strings.Contains(answer, "addDevFirmwareSuccess"):
		return nil
	case strings.Contains(answer, "addFirmwareFailedMinCCUVersion"):
		return ErrDeviceFirmwareNeedsNewerCCU
	case strings.Contains(answer, "addDevFirmwareInvalid"), strings.Contains(answer, "addDevFirmwareInfoCorrupt"),
		strings.Contains(answer, "addFirmwareFailedNotValidatable"):
		return ErrInvalidDeviceFirmware
	}
	return fmt.Errorf("%w: %s", ErrDeviceFirmwareFailed, strings.TrimSpace(answer))
}

func (s *Service) uploadDeviceFirmware(sessionID, path, fileName string) (string, int, error) {
	if !sessionIDRegex.MatchString(sessionID) {
		return "", 0, fmt.Errorf("unexpected WebUI session id %q", sessionID)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", 0, err
	}
	var head bytes.Buffer
	form := multipart.NewWriter(&head)
	if _, err := form.CreateFormFile("file", fileName); err != nil {
		return "", 0, err
	}
	tail := "\r\n--" + form.Boundary() + "--\r\n"
	target := s.webUIURL + "/pages/jpages/system/DeviceFirmware/addFirmware?sid=@" + sessionID + "@"
	req, err := http.NewRequest(http.MethodPost, target, io.MultiReader(&head, file, strings.NewReader(tail)))
	if err != nil {
		return "", 0, err
	}
	req.ContentLength = int64(head.Len()) + info.Size() + int64(len(tail))
	req.Header.Set("Content-Type", form.FormDataContentType())
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	answer, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	return string(answer), resp.StatusCode, nil
}

// DeleteDeviceFirmware removes a device firmware through the HMServer
// (deleteFirmware with firmwareID and deviceName)
func (s *Service) DeleteDeviceFirmware(username, password, id, name string) error {
	if !deviceFirmwareIDRegex.MatchString(id) {
		return ErrUploadNotFound
	}
	response, err := s.withSession(username, password, func(sessionID string) (hmserverResponse, error) {
		var r hmserverResponse
		return r, s.hmserverPage("/pages/jpages/system/DeviceFirmware/deleteFirmware", sessionID,
			map[string]string{"firmwareID": id, "deviceName": name}, &r)
	})
	if errors.Is(err, ErrGroupFailed) {
		return fmt.Errorf("%w: %v", ErrDeviceFirmwareFailed, err)
	}
	// The HMServer answers isSuccessful either way; a failure is only in
	// the content (DeviceFirmwareController: delDevFirmwareFailed)
	if err == nil && strings.Contains(response.Content, "delDevFirmwareFailed") {
		return ErrDeviceFirmwareFailed
	}
	return err
}

// SaveDownload stores a downloaded device firmware for AddDeviceFirmware;
// the caller removes the file
func (s *Service) SaveDownload(body io.Reader) (string, error) {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return "", err
	}
	file, err := os.CreateTemp(s.dir, "mui-devfw-*.tgz")
	if err != nil {
		return "", err
	}
	size, err := io.Copy(file, io.LimitReader(body, maxDeviceFirmwareSize+1))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && (size == 0 || size > maxDeviceFirmwareSize) {
		err = fmt.Errorf("%w: unexpected size %d", ErrInvalidDeviceFirmware, size)
	}
	if err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return file.Name(), nil
}
