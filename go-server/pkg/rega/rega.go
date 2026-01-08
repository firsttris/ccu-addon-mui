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

type Client struct {
	cfg        *config.Config
	httpClient *http.Client
	baseURL    string
}

func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		baseURL: fmt.Sprintf("http://%s:%d", cfg.CCUHost, cfg.RegaPort),
	}
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
	
	
	if matches := xmlWrapperRegex.FindStringSubmatch(result); len(matches) > 1 {
		return matches[1], nil
	}

	return result, nil
}

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

func (c *Client) GetRooms(deviceID string) (string, error) {
	script := strings.ReplaceAll(getRoomsScript, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

func (c *Client) GetTrades(deviceID string) (string, error) {
	script := strings.ReplaceAll(getTradesScript, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

func (c *Client) GetChannelsForRoom(roomID, deviceID string) (string, error) {
	script := getChannelsForRoomScript
	script = strings.ReplaceAll(script, "{{ROOM_ID}}", roomID)
	script = strings.ReplaceAll(script, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

func (c *Client) GetChannelsForTrade(tradeID, deviceID string) (string, error) {
	script := getChannelsForTradeScript
	script = strings.ReplaceAll(script, "{{TRADE_ID}}", tradeID)
	script = strings.ReplaceAll(script, "{{DEVICE_ID}}", deviceID)
	return c.Execute(script)
}

func (c *Client) SetDatapoint(interfaceName, address, attribute, value string) (string, error) {
	script := setDatapointScript
	script = strings.ReplaceAll(script, "{{INTERFACE}}", interfaceName)
	script = strings.ReplaceAll(script, "{{ADDRESS}}", address)
	script = strings.ReplaceAll(script, "{{ATTRIBUTE}}", attribute)
	script = strings.ReplaceAll(script, "{{VALUE}}", value)
	return c.Execute(script)
}
