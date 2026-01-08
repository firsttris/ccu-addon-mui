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

var xmlWrapperRegex = regexp.MustCompile(`(?s)(.*?)<xml>.*?</xml>\s*$`)

// Client handles communication with CCU Rega
type Client struct {
	cfg        *config.Config
	httpClient *http.Client
	baseURL    string
}

// NewClient creates a new Rega client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: fmt.Sprintf("http://%s:%d", cfg.CCUHost, cfg.RegaPort),
	}
}

// Execute executes a Rega script and returns the result
func (c *Client) Execute(script string) (string, error) {
	url := fmt.Sprintf("%s/rega.exe", c.baseURL)

	req, err := http.NewRequest("POST", url, bytes.NewBufferString(script))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "text/plain")

	// Add basic auth if configured
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

	// CCU sends responses in ISO-8859-1 (Latin-1), convert to UTF-8
	result := string(body)
	
	// Check if the response is valid UTF-8
	if !utf8.Valid(body) {
		// Convert from ISO-8859-1 to UTF-8
		decoder := charmap.ISO8859_1.NewDecoder()
		utf8Body, err := io.ReadAll(transform.NewReader(bytes.NewReader(body), decoder))
		if err != nil {
			return "", fmt.Errorf("failed to decode response: %w", err)
		}
		result = string(utf8Body)
	}
	
	// Extract content from XML wrapper
	// CCU returns: {content}<xml>...</xml>
	
	// Check if response contains XML wrapper
	if matches := xmlWrapperRegex.FindStringSubmatch(result); len(matches) > 1 {
		// Return content before XML wrapper
		return matches[1], nil
	}

	// If no XML wrapper found, return as-is (shouldn't happen with CCU)
	return result, nil
}

// TestConnection tests the connection to the CCU Rega
func (c *Client) TestConnection() error {
	logger.Debug(fmt.Sprintf("Testing connection to CCU Rega at %s:%d...", c.cfg.CCUHost, c.cfg.RegaPort))

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

// GetRooms returns all rooms with the given deviceID
func (c *Client) GetRooms(deviceID string) (string, error) {
	script := strings.ReplaceAll(getRoomsScript, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

// GetTrades returns all trades/functions with the given deviceID
func (c *Client) GetTrades(deviceID string) (string, error) {
	script := strings.ReplaceAll(getTradesScript, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

// GetChannelsForRoom returns all channels for a specific room
func (c *Client) GetChannelsForRoom(roomID, deviceID string) (string, error) {
	script := getChannelsForRoomScript
	script = strings.ReplaceAll(script, "{{ROOM_ID}}", roomID)
	script = strings.ReplaceAll(script, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

// GetChannelsForTrade returns all channels for a specific trade/function
func (c *Client) GetChannelsForTrade(tradeID, deviceID string) (string, error) {
	script := getChannelsForTradeScript
	script = strings.ReplaceAll(script, "{{TRADE_ID}}", tradeID)
	script = strings.ReplaceAll(script, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

// SetDatapoint sets a datapoint value
func (c *Client) SetDatapoint(interfaceName, address, attribute, value string) (string, error) {
	script := setDatapointScript
	script = strings.ReplaceAll(script, "{{INTERFACE}}", interfaceName)
	script = strings.ReplaceAll(script, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{ATTRIBUTE}}", attribute)
	script = strings.ReplaceAll(script, "{{VALUE}}", value)
	return c.Execute(script)
}
