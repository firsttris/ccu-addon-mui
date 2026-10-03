package rega

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// GetLayout returns the tile layout stored on a room, trade or favorite
// list ("" if none), with SetOK or SetNotFound.
func (c *Client) GetLayout(id int64) (result, layout string, err error) {
	output, err := c.Execute(strings.ReplaceAll(getLayoutScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	result, layout, err = resultWithValue(output)
	// MetaData of a name never set may read as "null"
	if layout == "null" {
		layout = ""
	}
	return result, layout, err
}

// SetLayout stores a tile layout (JSON; "" removes it). The JSON goes into
// a ^string^, so a ^ is refused.
func (c *Client) SetLayout(id int64, layout string) (result, name string, err error) {
	if len(layout) > 30000 || strings.Contains(layout, "^") || (layout != "" && !json.Valid([]byte(layout))) {
		return "", "", fmt.Errorf("invalid layout")
	}
	script := strings.NewReplacer("{{ID}}", strconv.FormatInt(id, 10), "{{LAYOUT}}", layout).Replace(setLayoutScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
