package backup

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// Installing an add-on goes through the WebUI's own steps (cp_software.cgi):
// fileupload.ccc stores the file, action image_upload moves it to
// /usr/local/tmp/new_addon.tar.gz, install_go runs /bin/install_addon:
// exit status 0 is installed, 10 installed and the CCU reboots, anything
// else failed ("Error (<status>)").

// ErrAddonFailed: install_addon reported a failure
var ErrAddonFailed = errors.New("the add-on could not be installed")

const softwarePage = "/config/cp_software.cgi"

var addonErrorRegex = regexp.MustCompile(`Error \((\d+)\)`)

// InstallAddon installs an uploaded add-on. Returns whether the CCU reboots
// to finish it.
func (s *Service) InstallAddon(id, username, password string) (reboot bool, err error) {
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
	filename, err := s.fileUpload(sessionID, path, "firmware_file", "image_upload", softwarePage)
	if err != nil {
		return false, err
	}
	s.Discard(id)
	if _, err := s.pageAction(sessionID, softwarePage, url.Values{"action": {"image_upload"}, "filename": {filename}}); err != nil {
		return false, err
	}
	page, err := s.pageAction(sessionID, softwarePage, url.Values{"action": {"install_go"}})
	if err != nil {
		return false, err
	}
	switch {
	case addonErrorRegex.MatchString(page):
		return false, errors.Join(ErrAddonFailed, errors.New("install_addon: "+addonErrorRegex.FindString(page)))
	case strings.Contains(page, "HintPerformInstallationContentNoReboot"):
		return false, nil
	case strings.Contains(page, "HintPerformInstallationContent"):
		return true, nil
	default:
		return false, errors.New("unexpected answer from the CCU")
	}
}
