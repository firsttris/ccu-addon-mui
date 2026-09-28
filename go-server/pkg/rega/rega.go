package rega

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"regexp"
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

func (c *Client) SetDatapoint(interfaceName, address, attribute, value string) (string, error) {
	// Validate identifiers to prevent script injection
	if !safeIdentifierRegex.MatchString(interfaceName) || !safeIdentifierRegex.MatchString(address) || !safeIdentifierRegex.MatchString(attribute) {
		return "", fmt.Errorf("invalid identifier in interfaceName, address, or attribute")
	}

	regaValue, err := sanitizeRegaValue(value)
	if err != nil {
		return "", err
	}

	script := strings.ReplaceAll(setDatapointScript, "{{INTERFACE}}", interfaceName)
	script = strings.ReplaceAll(script, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{ATTRIBUTE}}", attribute)
	script = strings.ReplaceAll(script, "{{VALUE}}", regaValue)
	return c.Execute(script)
}
