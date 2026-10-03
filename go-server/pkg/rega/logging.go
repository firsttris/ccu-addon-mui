package rega

import (
	"fmt"
	"strconv"
	"strings"
)

// GetLogLevel reads the log level of the logic layer (0 everything,
// 1 information, 2 errors, 3 nothing; cp_maintenance.cgi REGA_LOGLEVELS)
func (c *Client) GetLogLevel() (int, error) {
	output, err := c.Execute(getLogLevelScript)
	if err != nil {
		return 0, err
	}
	level, err := strconv.Atoi(strings.TrimSpace(output))
	if err != nil {
		return 0, fmt.Errorf("unexpected log level %q", output)
	}
	return level, nil
}

// SetLogLevel sets the log level of the logic layer
func (c *Client) SetLogLevel(level int) (string, error) {
	if level < 0 || level > 3 {
		return "", fmt.Errorf("invalid log level")
	}
	output, err := c.Execute(strings.ReplaceAll(setLogLevelScript, "{{LEVEL}}", strconv.Itoa(level)))
	if err != nil {
		return "", err
	}
	result, _, err := resultWithValue(output)
	return result, err
}
