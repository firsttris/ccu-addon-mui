package rega

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/transform"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
)

type Client struct {
	cfg        *config.Config
	httpClient *http.Client
	baseURL    string
}

var safeIdentifierRegex = regexp.MustCompile(`^[a-zA-Z0-9_:.-]+$`)
var objectIDRegex = regexp.MustCompile(`^[0-9]{1,10}$`)
var numberRegex = regexp.MustCompile(`^-?[0-9]+\.?[0-9]*$`)

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: fmt.Sprintf("http://%s:%d", cfg.CCUHost, cfg.RegaPort),
	}
}

func sanitizeRegaValue(value string) (string, error) {
	// Numbers and booleans are safe as-is
	if value == "true" || value == "false" || numberRegex.MatchString(value) {
		return value, nil
	}
	// ReGa has no reliable escape sequences inside string literals, so
	// characters that could end the literal are rejected instead of escaped.
	if strings.ContainsAny(value, "\"\\\r\n") {
		return "", fmt.Errorf("value contains unsupported characters")
	}
	return "\"" + value + "\"", nil
}

func (c *Client) Execute(script string) (string, error) {
	url := fmt.Sprintf("%s/rega.exe", c.baseURL)

	req, err := http.NewRequest("POST", url, bytes.NewBufferString(script))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "text/plain")

	if c.cfg.CCUUser != "" && c.cfg.CCUPass != "" {
		req.SetBasicAuth(c.cfg.CCUUser, c.cfg.CCUPass)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("rega returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	result := string(body)

	if !utf8.Valid(body) {
		decoder := charmap.ISO8859_1.NewDecoder()
		utf8Body, err := io.ReadAll(transform.NewReader(bytes.NewReader(body), decoder))
		if err != nil {
			return "", fmt.Errorf("failed to decode response: %w", err)
		}
		result = string(utf8Body)
	}

	// rega.exe appends its variables as <xml>...</xml>. Search from the end,
	// the script output itself may contain "<xml>".
	if i := strings.LastIndex(result, "<xml>"); i >= 0 && strings.HasSuffix(strings.TrimSpace(result), "</xml>") {
		return result[:i], nil
	}

	return result, nil
}

func (c *Client) TestConnection() error {
	logger.Debugf("Testing connection to CCU Rega at %s:%d...", c.cfg.CCUHost, c.cfg.RegaPort)

	result, err := c.Execute("Write(\"Hello from WebSocket Server\");")
	if err != nil {
		logger.Error("❌ CCU Rega connection failed:", err)
		logger.Error(fmt.Sprintf("   Make sure %s:%d is reachable", c.cfg.CCUHost, c.cfg.RegaPort))
		return err
	}

	logger.Info("✅ CCU Rega connection successful")
	logger.Debug("   Response:", result)
	return nil
}

// validateObjectID guards the room or trade id substituted into the ReGa
// script: it ends up inside a string literal, so anything outside the
// whitelist could break out and run arbitrary ReGa code (including
// system.Exec).
func validateObjectID(id string) error {
	if !objectIDRegex.MatchString(id) {
		return fmt.Errorf("invalid room or trade id")
	}
	return nil
}

func (c *Client) GetRooms() ([]NamedObject, error) {
	output, err := c.Execute(getRoomsScript)
	if err != nil {
		return nil, err
	}
	return parseNamedObjects(output), nil
}

func (c *Client) GetTrades() ([]NamedObject, error) {
	output, err := c.Execute(getTradesScript)
	if err != nil {
		return nil, err
	}
	return parseNamedObjects(output), nil
}

// GetChannels returns the channels of a room or trade.
func (c *Client) GetChannels(objectID string) ([]Channel, error) {
	if err := validateObjectID(objectID); err != nil {
		return nil, err
	}
	output, err := c.Execute(strings.ReplaceAll(getChannelsScript, "{{OBJECT_ID}}", objectID))
	if err != nil {
		return nil, err
	}
	return parseChannels(output), nil
}

// GetAllChannels returns the channels of all devices, also those in no room
// or trade. Maintenance channels and the CCU's virtual keys are left out.
func (c *Client) GetAllChannels() ([]Channel, error) {
	output, err := c.Execute(strings.ReplaceAll(getChannelsScript, "{{OBJECT_ID}}", "ALL"))
	if err != nil {
		return nil, err
	}
	return parseChannels(output), nil
}

// GetUserLevel returns the level of a CCU user as stored in ReGa
// (1 = guest, 2 = user, 8 = admin).
func (c *Client) GetUserLevel(username string) (int, error) {
	// The name ends up inside a string literal, see sanitizeRegaValue
	if username == "" || strings.ContainsAny(username, "\"\\\r\n") {
		return 0, fmt.Errorf("invalid username")
	}
	output, err := c.Execute(strings.ReplaceAll(getUserLevelScript, "{{USERNAME}}", username))
	if err != nil {
		return 0, err
	}
	level, err := strconv.Atoi(strings.TrimSpace(output))
	if err != nil {
		return 0, fmt.Errorf("no user level for %q", username)
	}
	return level, nil
}

// Results of SetDatapoint
const (
	SetOK       = "OK"
	SetNotFound = "NOT_FOUND"
	SetUnreach  = "UNREACH"
)

// SetDatapoint sets a datapoint and returns SetOK, SetNotFound or
// SetUnreach (the device is unreachable, so nothing was sent), and with
// SetOK the value the datapoint had before.
func (c *Client) SetDatapoint(interfaceName, address, attribute, value string) (result, previous string, err error) {
	// Validate identifiers to prevent script injection
	if !safeIdentifierRegex.MatchString(interfaceName) || !safeIdentifierRegex.MatchString(address) || !safeIdentifierRegex.MatchString(attribute) {
		return "", "", fmt.Errorf("invalid identifier in interfaceName, address, or attribute")
	}

	regaValue, err := sanitizeRegaValue(value)
	if err != nil {
		return "", "", err
	}

	// Battery and reachability are on the device's channel 0
	deviceAddress, _, _ := strings.Cut(address, ":")

	script := strings.ReplaceAll(setDatapointScript, "{{INTERFACE}}", interfaceName)
	script = strings.ReplaceAll(script, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{DEVICE_ADDRESS}}", deviceAddress)
	script = strings.ReplaceAll(script, "{{ATTRIBUTE}}", attribute)
	script = strings.ReplaceAll(script, "{{VALUE}}", regaValue)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}

	result, previous, _ = strings.Cut(strings.TrimRight(output, "\r\n"), "\t")
	switch result {
	case SetOK, SetNotFound, SetUnreach:
		return result, previous, nil
	default:
		return "", "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
}

// GetDeviceProblems returns all devices with a low battery or that are
// unreachable.
func (c *Client) GetDeviceProblems() ([]DeviceProblem, error) {
	output, err := c.Execute(getDeviceProblemsScript)
	if err != nil {
		return nil, err
	}
	return parseDeviceProblems(output), nil
}
