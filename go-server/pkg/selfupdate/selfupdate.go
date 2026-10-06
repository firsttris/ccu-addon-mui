// Package selfupdate updates this add-on from its GitHub release without
// rebooting the CCU. The WebUI's Zusatzsoftware dialog only installs at the
// next boot on a CCU3 (cp_software.cgi action_install_start: touch
// /usr/local/.doAddonInstall, reboot); OpenCCU runs the archive's
// update_script at once (/bin/install_addon). This does what install_addon
// does, for this add-on only: unpack the release archive and run its
// update_script, which replaces the files, reloads lighttpd and restarts
// the server.
package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

var (
	// ErrNoAsset: the release has no archive for this platform, or GitHub
	// gives no checksum for it
	ErrNoAsset = errors.New("the release has no archive with a checksum for this platform")
	// ErrChecksum: the download doesn't match the checksum GitHub gives
	ErrChecksum = errors.New("the downloaded archive does not match its SHA256 checksum")
	// ErrRunning: an update is being installed already
	ErrRunning = errors.New("an update is being installed already")
	// ErrScript: the archive's update_script is missing or failed
	ErrScript = errors.New("the update script failed")
)

// The archive names of the release (package.json tar:gz): the ARM server
// for the CCU3 and every Raspberry Pi, the amd64 one for OpenCCU on x86.
// The running server is built for one of them.
var assetSuffix = map[string]string{
	"arm":   "-arm-ccu3-raspi.tar.gz",
	"amd64": "-x86_64-pc.tar.gz",
}

var (
	versionRegex = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z]+\.[0-9]+)?$`)
	digestRegex  = regexp.MustCompile(`^sha256:([0-9a-f]{64})$`)
)

const (
	// The archive is about 5 MB
	maxArchiveBytes  = 100 << 20
	maxUnpackedBytes = 300 << 20
	scriptTimeout    = 2 * time.Minute
)

// Release is the newest release and its archive for this platform.
type Release struct {
	Version string
	Asset   string
	URL     string
	SHA256  string
}

type Updater struct {
	// ReleaseURL answers like GitHub's API for the latest release
	ReleaseURL string
	// WorkDir is where the archive is downloaded and unpacked: the user
	// partition, as install_addon does (/usr/local/tmp)
	WorkDir string
	// Arch picks the archive (runtime.GOARCH)
	Arch   string
	Client *http.Client

	running sync.Mutex
}

func New(releaseURL, workDir string) *Updater {
	return &Updater{ReleaseURL: releaseURL, WorkDir: workDir, Arch: runtime.GOARCH, Client: &http.Client{Timeout: 2 * time.Minute}}
}

// Latest asks GitHub for the newest release and picks its archive for this
// platform, with the SHA256 checksum GitHub keeps for every release file.
func (u *Updater) Latest() (Release, error) {
	req, err := http.NewRequest(http.MethodGet, u.ReleaseURL, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := u.Client.Do(req)
	if err != nil {
		return Release{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("release check returned status %d", resp.StatusCode)
	}
	var answer struct {
		Tag    string `json:"tag_name"`
		Assets []struct {
			Name   string `json:"name"`
			URL    string `json:"browser_download_url"`
			Digest string `json:"digest"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&answer); err != nil {
		return Release{}, fmt.Errorf("unexpected answer from the release check: %w", err)
	}
	version := strings.TrimPrefix(answer.Tag, "v")
	if !versionRegex.MatchString(version) {
		return Release{}, fmt.Errorf("unexpected release version %q", answer.Tag)
	}
	suffix, ok := assetSuffix[u.Arch]
	if !ok {
		return Release{}, ErrNoAsset
	}
	name := "mui-" + version + suffix
	for _, asset := range answer.Assets {
		if asset.Name != name {
			continue
		}
		digest := digestRegex.FindStringSubmatch(asset.Digest)
		if digest == nil || asset.URL == "" {
			break
		}
		return Release{Version: version, Asset: name, URL: asset.URL, SHA256: digest[1]}, nil
	}
	return Release{Version: version}, ErrNoAsset
}

// Install downloads the release's archive, checks it, unpacks it and runs
// its update_script. The script restarts the server a few seconds after it
// returned (update_script: sleep 3, rc.d/mui restart), which leaves time to
// answer.
func (u *Updater) Install(ctx context.Context, release Release) error {
	if !u.running.TryLock() {
		return ErrRunning
	}
	defer u.running.Unlock()
	if release.URL == "" || release.SHA256 == "" {
		return ErrNoAsset
	}
	if err := os.MkdirAll(u.WorkDir, 0o755); err != nil {
		return err
	}
	archive, err := u.download(ctx, release)
	if err != nil {
		return err
	}
	defer os.Remove(archive)
	dir, err := os.MkdirTemp(u.WorkDir, "mui-update-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if err := unpack(archive, dir); err != nil {
		return err
	}
	return runScript(ctx, dir)
}

// download stores the archive in WorkDir and checks its checksum
func (u *Updater) download(ctx context.Context, release Release) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, release.URL, nil)
	if err != nil {
		return "", err
	}
	resp, err := u.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}
	file, err := os.CreateTemp(u.WorkDir, "mui-update-*.tar.gz")
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(resp.Body, maxArchiveBytes+1))
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err == nil && n > maxArchiveBytes {
		err = fmt.Errorf("the archive is larger than %d MB", maxArchiveBytes>>20)
	}
	if err == nil && hex.EncodeToString(hash.Sum(nil)) != release.SHA256 {
		err = ErrChecksum
	}
	if err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return file.Name(), nil
}

// unpack extracts the archive into dir as install_addon does (tar
// --no-same-owner --no-same-permissions, umask 022): only directories and
// regular files, none outside dir, modes without group or other write.
func unpack(archive, dir string) error {
	file, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	reader := tar.NewReader(gz)
	var total int64
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		name := filepath.Clean(header.Name)
		if name == "." {
			continue
		}
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, "../") {
			return fmt.Errorf("the archive has a path outside its directory: %q", header.Name)
		}
		target := filepath.Join(dir, name)
		mode := os.FileMode(header.Mode).Perm() &^ 0o022
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, mode|0o700); err != nil {
				return err
			}
		case tar.TypeReg:
			total += header.Size
			if total > maxUnpackedBytes {
				return fmt.Errorf("the archive unpacks to more than %d MB", maxUnpackedBytes>>20)
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return err
			}
			_, err = io.Copy(out, reader)
			if closeErr := out.Close(); err == nil {
				err = closeErr
			}
			if err != nil {
				return err
			}
		default:
			return fmt.Errorf("the archive has an entry that is no file or directory: %q", header.Name)
		}
	}
}

// runScript runs the archive's update_script in its directory, in a
// process group of its own: the restart it leaves running in the
// background stops this server and must outlive it. Its output goes to a
// file, not a pipe: a daemon it restarts (lighttpd) could keep a pipe open
// and the wait would never end.
func runScript(ctx context.Context, dir string) error {
	script := filepath.Join(dir, "update_script")
	if stat, err := os.Stat(script); err != nil || !stat.Mode().IsRegular() || stat.Mode()&0o100 == 0 {
		return fmt.Errorf("%w: the archive has no update_script", ErrScript)
	}
	output, err := os.CreateTemp(dir, "output-")
	if err != nil {
		return err
	}
	defer output.Close()
	ctx, cancel := context.WithTimeout(ctx, scriptTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "./update_script")
	cmd.Dir = dir
	cmd.Stdout, cmd.Stderr = output, output
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Run(); err != nil {
		text, _ := os.ReadFile(output.Name())
		if len(text) > 2000 {
			text = text[len(text)-2000:]
		}
		return fmt.Errorf("%w: %v %s", ErrScript, err, bytes.TrimSpace(text))
	}
	return nil
}
