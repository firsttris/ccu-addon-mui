package rega

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/latin1"
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

// How long a script may take: most read or change one object. Those going
// through all devices take longer on a CCU with many of them, but stay below
// the app's 20 s for an answer (REQUEST_TIMEOUT_MS).
const (
	scriptTimeout     = 10 * time.Second
	longScriptTimeout = 18 * time.Second
)

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		// Timeouts per script (executeWithin)
		httpClient: &http.Client{},
		baseURL:    fmt.Sprintf("http://%s:%d", cfg.CCUHost, cfg.RegaPort),
	}
}

func sanitizeRegaValue(value string) (string, error) {
	// Numbers and booleans are safe as-is
	if value == "true" || value == "false" || numberRegex.MatchString(value) {
		return value, nil
	}
	return quoteRegaText(value)
}

// quoteRegaText writes a string literal. ReGa has no reliable escape
// sequences inside string literals, so characters that could end the
// literal are rejected instead of escaped.
func quoteRegaText(value string) (string, error) {
	if strings.ContainsAny(value, "\"\\\r\n") {
		return "", fmt.Errorf("value contains unsupported characters")
	}
	return "\"" + value + "\"", nil
}

// Execute runs an HM script. ReGa works in ISO-8859-1 (see package latin1):
// the script is sent and the output read in it, so a name written here reads
// the same in the WebUI. Text with other characters is refused.
func (c *Client) Execute(script string) (string, error) {
	return c.executeWithin(script, scriptTimeout)
}

func (c *Client) executeWithin(script string, timeout time.Duration) (string, error) {
	url := fmt.Sprintf("%s/rega.exe", c.baseURL)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	encoded, err := latin1.Encode(script)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(encoded))
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

	result := latin1.Decode(body)

	// rega.exe appends its variables as <xml>...</xml>. Search from the end,
	// the script output itself may contain "<xml>".
	if i := strings.LastIndex(result, "<xml>"); i >= 0 && strings.HasSuffix(strings.TrimSpace(result), "</xml>") {
		return result[:i], nil
	}

	return result, nil
}

// EndMarker is written last by scripts run with ExecuteComplete
const EndMarker = "MUI-END"

// ExecuteComplete runs one of the add-on's scripts whose output must be
// complete. ReGa stops a script at a runtime error and still answers 200
// with what it wrote so far: a cut list would pass as the whole one (e.g.
// fewer read-only channels, so non-administrators could operate them). The
// script gets a last line written after everything else; without it the
// output is an error.
func (c *Client) ExecuteComplete(script string) (string, error) {
	output, err := c.Execute(script + "\nWriteLine(\"" + EndMarker + "\");\n")
	if err != nil {
		return "", err
	}
	trimmed := strings.TrimRight(output, "\r\n ")
	if !strings.HasSuffix(trimmed, EndMarker) {
		return "", fmt.Errorf("script stopped before its end")
	}
	return strings.TrimSuffix(trimmed, EndMarker), nil
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
	output, err := c.executeWithin(strings.ReplaceAll(getChannelsScript, "{{OBJECT_ID}}", "ALL"), longScriptTimeout)
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

// GetDeviceNames returns the names of all devices by address.
func (c *Client) GetDeviceNames() (map[string]string, error) {
	output, err := c.Execute(getDeviceNamesScript)
	if err != nil {
		return nil, err
	}
	isRecord := func(line string) bool { return strings.Contains(line, "\t") }
	names := map[string]string{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) >= 2 {
			names[fields[0]] = rejoin(fields, 1)
		}
	}
	return names, nil
}

// InboxDevice is a paired device not yet accepted in the CCU.
type InboxDevice struct {
	Address       string `json:"address"`
	Type          string `json:"type"`
	InterfaceName string `json:"interfaceName"`
	Name          string `json:"name"`
}

// GetInbox returns the devices in the inbox.
func (c *Client) GetInbox() ([]InboxDevice, error) {
	output, err := c.Execute(getInboxScript)
	if err != nil {
		return nil, err
	}
	isRecord := func(line string) bool { return strings.Count(line, "\t") >= 3 }
	devices := []InboxDevice{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) >= 4 {
			devices = append(devices, InboxDevice{Address: fields[0], Type: fields[1], InterfaceName: fields[2], Name: rejoin(fields, 3)})
		}
	}
	return devices, nil
}

// AcceptDevice takes a device out of the inbox. Returns SetOK or SetNotFound.
func (c *Client) AcceptDevice(address string) (string, error) {
	if !safeIdentifierRegex.MatchString(address) {
		return "", fmt.Errorf("invalid address")
	}
	output, err := c.Execute(strings.ReplaceAll(acceptDeviceScript, "{{ADDRESS}}", address))
	if err != nil {
		return "", err
	}
	switch result := strings.TrimSpace(output); result {
	case SetOK, SetNotFound:
		return result, nil
	default:
		return "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
}

// validateName guards a name substituted into a string literal: ReGa has no
// escapes, so characters that could end the literal are rejected.
func validateName(name string) error {
	if strings.TrimSpace(name) == "" || len(name) > 100 || strings.ContainsAny(name, "\"\\\r\n\t") {
		return fmt.Errorf("invalid name")
	}
	return nil
}

// SetName renames a device or channel and returns its previous name, or
// SetNotFound.
func (c *Client) SetName(address, name string) (result, previous string, err error) {
	if !safeIdentifierRegex.MatchString(address) {
		return "", "", fmt.Errorf("invalid address")
	}
	if err := validateName(name); err != nil {
		return "", "", err
	}
	script := strings.ReplaceAll(setNameScript, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{NAME}}", name)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	result, previous, _ = strings.Cut(strings.TrimRight(output, "\r\n"), "\t")
	if result != SetOK && result != SetNotFound {
		return "", "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
	return result, previous, nil
}

// SetGroupMember adds a channel to a room or trade (member) or removes it.
// Returns SetOK or SetNotFound.
func (c *Client) SetGroupMember(groupID, channelID int64, member bool) (string, error) {
	action := "Remove"
	if member {
		action = "Add"
	}
	script := strings.ReplaceAll(setGroupMemberScript, "{{GROUP_ID}}", strconv.FormatInt(groupID, 10))
	script = strings.ReplaceAll(script, "{{CHANNEL_ID}}", strconv.FormatInt(channelID, 10))
	script = strings.ReplaceAll(script, "{{ACTION}}", action)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	switch result := strings.TrimSpace(output); result {
	case SetOK, SetNotFound:
		return result, nil
	default:
		return "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
}

// Results of SetDatapoint
const (
	SetOK       = "OK"
	SetNotFound = "NOT_FOUND"
)

// SetDatapoint sets a datapoint and returns SetOK or SetNotFound, and with
// SetOK the value the datapoint had before. An unreachable device is sent
// to as well, as the WebUI does (set_datapoint.tcl).
func (c *Client) SetDatapoint(interfaceName, address, attribute, value string) (result, previous string, err error) {
	// Validate identifiers to prevent script injection
	if !safeIdentifierRegex.MatchString(interfaceName) || !safeIdentifierRegex.MatchString(address) || !safeIdentifierRegex.MatchString(attribute) {
		return "", "", fmt.Errorf("invalid identifier in interfaceName, address, or attribute")
	}

	regaValue, err := sanitizeRegaValue(value)
	if err != nil {
		return "", "", err
	}

	script := strings.ReplaceAll(setDatapointScript, "{{INTERFACE}}", interfaceName)
	script = strings.ReplaceAll(script, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{ATTRIBUTE}}", attribute)
	script = strings.ReplaceAll(script, "{{VALUE}}", regaValue)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}

	result, previous, _ = strings.Cut(strings.TrimRight(output, "\r\n"), "\t")
	switch result {
	case SetOK, SetNotFound:
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

// Tiles that can be chosen for a channel
const (
	TileLight  = "light"
	TileSwitch = "switch"
)

// SetChannelMode stores what an input channel is wired to (0 off, 1 key,
// 2 switch, 3 contact, 4 level, 5 condition) as the channel's metadata "channelMode", as the
// WebUI does when CHANNEL_OPERATION_MODE is saved. Result is OK or
// NOT_FOUND.
func (c *Client) SetChannelMode(iface, address string, mode int) (string, error) {
	if !safeIdentifierRegex.MatchString(iface) || !safeIdentifierRegex.MatchString(address) {
		return "", fmt.Errorf("invalid address")
	}
	if mode < 0 || mode > MaxChannelMode {
		return "", fmt.Errorf("invalid channel mode")
	}
	script := strings.NewReplacer("{{INTERFACE}}", iface, "{{ADDRESS}}", address, "{{MODE}}", strconv.Itoa(mode)).Replace(setChannelModeScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

// SetChannelTile stores the tile chosen for a channel ("light", "switch",
// or "" for the app's own choice). Returns SetOK with the channel's name,
// or SetNotFound.
func (c *Client) SetChannelTile(id int64, tile string) (result, name string, err error) {
	if tile != "" && tile != TileLight && tile != TileSwitch {
		return "", "", fmt.Errorf("invalid tile")
	}
	script := strings.ReplaceAll(setChannelTileScript, "{{ID}}", strconv.FormatInt(id, 10))
	script = strings.ReplaceAll(script, "{{TILE}}", tile)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
