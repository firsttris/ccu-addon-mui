package backup

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Restoring a backup goes through the WebUI's own steps (cp_security.cgi):
// the .sbk goes up with fileupload.ccc, which stores it under a temporary
// name and sends the browser on to action backup_upload with that
// filename (moving it to new_config.tar); then backup_restore_check
// unpacks and checks it, backup_restore_go applies it and the CCU reboots
// (action reboot). Each check unpacks the upload anew, so the file is kept
// here between the steps.

var (
	// ErrInvalidBackup: the file is no HomeMatic system backup
	ErrInvalidBackup = errors.New("invalid backup")
	// ErrWrongKey: the system security key doesn't fit
	ErrWrongKey = errors.New("wrong security key")
	// ErrFirmwareTooOld: the backup is from a newer firmware than the CCU's
	ErrFirmwareTooOld = errors.New("the backup needs a newer firmware")
	// ErrUploadNotFound: no uploaded backup under this id
	ErrUploadNotFound = errors.New("upload not found")
)

// An upload waits this long for the restore
const uploadLifetime = 30 * time.Minute

// The largest backup taken (a CCU with a long history)
const maxBackupSize = 1 << 30

// Where fileupload.ccc stored the upload (mktemp -p /usr/local/tmp)
var uploadedFileRegex = regexp.MustCompile(`action=([a-z_]+)&filename=(/usr/local/tmp/[A-Za-z0-9._-]+)'`)

// The texts the WebUI's answers carry, untranslated (${...} keys)
const (
	markInvalidFile  = "SysBackupInvalidFileTitle"
	markKeyField     = `id="text_key"`
	markNoKey        = "value=dummy"
	markRestart      = "SysBackupRestartSystemTitle"
	markKeyError     = "SysBackupSecurityError"
	markFirmware     = "SysBackupFWUpdateNecessary"
	markRestoreError = "SysBackupErrorTitle"
)

type upload struct {
	path    string
	expires time.Time
	// Where and how large; the backup directory and maxBackupSize unless
	// set by PrepareUploadTo
	dir   string
	limit int64
}

// The largest CCU firmware file taken (an OpenCCU .img)
const maxFirmwareSize = 4 << 30

// PrepareUpload returns an id to upload a backup to, once
func (s *Service) PrepareUpload() (string, error) {
	id, err := randomID()
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.uploads == nil {
		s.uploads = map[string]*upload{}
	}
	s.uploads[id] = &upload{expires: s.now().Add(uploadLifetime), dir: s.dir, limit: maxBackupSize}
	return id, nil
}

// PrepareFirmwareUpload is PrepareUpload for a CCU firmware stored in dir
// on the CCU itself, which the WebUI then checks in place (CheckFirmware):
// no copy through fileupload.ccc, no RAM disk
func (s *Service) PrepareFirmwareUpload(dir string) (string, error) {
	id, err := s.PrepareUpload()
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	s.uploads[id].dir, s.uploads[id].limit = dir, maxFirmwareSize
	s.mu.Unlock()
	return id, nil
}

// ServeUpload takes the backup for a prepared id: POST <prefix>/<id>
func (s *Service) ServeUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	s.mu.Lock()
	up, ok := s.uploads[id]
	if ok && (up.path != "" || s.now().After(up.expires)) {
		ok = false
	}
	var dir string
	var limit int64
	if ok {
		dir, limit = up.dir, up.limit
	}
	s.mu.Unlock()
	if !ok {
		http.Error(w, "upload not prepared or already used", http.StatusNotFound)
		return
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	pattern := "mui-restore-*.sbk"
	if limit == maxFirmwareSize {
		pattern = "mui-firmware-*"
	}
	file, err := os.CreateTemp(dir, pattern)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	size, err := io.Copy(file, io.LimitReader(r.Body, limit+1))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && (size == 0 || size > limit) {
		err = fmt.Errorf("unexpected size %d", size)
	}
	if err != nil {
		os.Remove(file.Name())
		http.Error(w, "upload failed: "+err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	up.path = file.Name()
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) uploadPath(id string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	up, ok := s.uploads[id]
	if !ok || up.path == "" || s.now().After(up.expires) {
		return "", ErrUploadNotFound
	}
	return up.path, nil
}

// forget drops an upload without removing its file, which someone else
// owns now (a staged firmware update)
func (s *Service) forget(id string) {
	s.mu.Lock()
	delete(s.uploads, id)
	s.mu.Unlock()
}

// Discard removes an uploaded backup
func (s *Service) Discard(id string) {
	s.mu.Lock()
	up, ok := s.uploads[id]
	delete(s.uploads, id)
	s.mu.Unlock()
	if ok && up.path != "" {
		os.Remove(up.path)
	}
}

func (s *Service) removeExpiredUploads() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, up := range s.uploads {
		if s.now().After(up.expires) {
			if up.path != "" {
				os.Remove(up.path)
			}
			delete(s.uploads, id)
		}
	}
}

// CheckRestore uploads the backup to the WebUI and lets it check it.
// Returns whether a system security key is needed.
func (s *Service) CheckRestore(id, username, password string) (needsKey bool, err error) {
	s.removeExpiredUploads()
	path, err := s.uploadPath(id)
	if err != nil {
		return false, err
	}
	sessionID, err := s.login(username, password)
	if err != nil {
		return false, err
	}
	defer s.logout(sessionID)
	page, err := s.uploadAndCheck(sessionID, path)
	if err != nil {
		return false, err
	}
	return strings.Contains(page, markKeyField) && !strings.Contains(page, markNoKey), nil
}

// Restore applies the backup and reboots the CCU, as backup_restore_go;
// key is the system security key if one is needed.
func (s *Service) Restore(id, username, password, key string) error {
	path, err := s.uploadPath(id)
	if err != nil {
		return err
	}
	sessionID, err := s.login(username, password)
	if err != nil {
		return err
	}
	defer s.logout(sessionID)
	if _, err := s.uploadAndCheck(sessionID, path); err != nil {
		return err
	}
	if key == "" {
		key = "dummy"
	}
	page, err := s.securityAction(sessionID, url.Values{"action": {"backup_restore_go"}, "key": {key}})
	if err != nil {
		return err
	}
	switch {
	case strings.Contains(page, markKeyError):
		return ErrWrongKey
	case strings.Contains(page, markFirmware):
		return ErrFirmwareTooOld
	case strings.Contains(page, markRestart):
	case strings.Contains(page, markRestoreError):
		return fmt.Errorf("the CCU could not restore the backup")
	default:
		return fmt.Errorf("unexpected answer from the CCU")
	}
	s.Discard(id)
	// As the WebUI's page does once the backup is in
	_, err = s.securityAction(sessionID, url.Values{"action": {"reboot"}})
	return err
}

func (s *Service) uploadAndCheck(sessionID, path string) (string, error) {
	filename, err := s.fileUpload(sessionID, path, "backup_file", "backup_upload", "/config/cp_security.cgi")
	if err != nil {
		return "", err
	}
	if _, err := s.securityAction(sessionID, url.Values{"action": {"backup_upload"}, "filename": {filename}}); err != nil {
		return "", err
	}
	page, err := s.securityAction(sessionID, url.Values{"action": {"backup_restore_check"}})
	if err != nil {
		return "", err
	}
	if strings.Contains(page, markInvalidFile) {
		return "", ErrInvalidBackup
	}
	return page, nil
}

// fileUpload sends a file through the WebUI's fileupload.ccc and returns
// where it stored it: its page goes on with LoadFromFile(url,
// 'action=<action>&filename=/usr/local/tmp/tmp.XXXXXX'), which the caller
// then posts to the page in url.
func (s *Service) fileUpload(sessionID, path, field, action, page string) (string, error) {
	if !sessionIDRegex.MatchString(sessionID) {
		return "", fmt.Errorf("unexpected WebUI session id %q", sessionID)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	// fileupload.ccc reads one part (boundary, disposition, type, blank
	// line) and takes its size from CONTENT_LENGTH: the body is streamed
	// from the file with its exact length, a file may not fit into the
	// CCU's memory twice
	var head bytes.Buffer
	form := multipart.NewWriter(&head)
	if _, err := form.CreateFormFile(field, filepath.Base(path)); err != nil {
		return "", err
	}
	tail := "\r\n--" + form.Boundary() + "--\r\n"
	target := s.webUIURL + "/config/fileupload.ccc?sid=@" + sessionID + "@&action=" + action + "&url=" + page
	req, err := http.NewRequest(http.MethodPost, target, io.MultiReader(&head, file, strings.NewReader(tail)))
	if err != nil {
		return "", err
	}
	req.ContentLength = int64(head.Len()) + info.Size() + int64(len(tail))
	req.Header.Set("Content-Type", form.FormDataContentType())
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("CCU not reachable: %w", err)
	}
	answer, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || strings.HasPrefix(string(answer), "ERROR") {
		return "", fmt.Errorf("the CCU did not take the file: %s", strings.TrimSpace(string(answer)))
	}
	match := uploadedFileRegex.FindStringSubmatch(string(answer))
	if match == nil || match[1] != action {
		return "", fmt.Errorf("unexpected answer from fileupload.ccc")
	}
	return match[2], nil
}

// securityAction posts an action to cp_security.cgi and returns its page
func (s *Service) securityAction(sessionID string, form url.Values) (string, error) {
	return s.pageAction(sessionID, "/config/cp_security.cgi", form)
}

// pageAction posts an action to a WebUI page and returns what it answers
func (s *Service) pageAction(sessionID, page string, form url.Values) (string, error) {
	resp, err := s.httpClient.Post(s.webUIURL+page+"?sid=@"+sessionID+"@",
		"application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	answer, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("CCU returned status %d", resp.StatusCode)
	}
	return string(answer), nil
}
