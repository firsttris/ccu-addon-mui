package rega

import (
	"fmt"
	"strings"
)

// The longest script the editor may test
const maxScriptLength = 64 * 1024

// CheckScript checks a script's syntax; "" means it is fine
func (c *Client) CheckScript(code string) (string, error) {
	if code == "" || len(code) > maxScriptLength {
		return "", fmt.Errorf("invalid script length")
	}
	// A ^ ends the ^-string: the WebUI writes it as ^#"^"#^ (webui.js,
	// HMScriptExecutor.run)
	escaped := strings.ReplaceAll(code, "^", `^#"^"#^`)
	output, err := c.Execute(strings.ReplaceAll(checkScriptScript, "{{CODE}}", escaped))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(output), nil
}

// RunScript runs a script as is and returns what it writes, as
// ReGa.runScript does for the WebUI's script editor
func (c *Client) RunScript(code string) (string, error) {
	if code == "" || len(code) > maxScriptLength {
		return "", fmt.Errorf("invalid script length")
	}
	return c.Execute(code)
}
