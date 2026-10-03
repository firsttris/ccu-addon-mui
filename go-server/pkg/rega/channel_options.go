package rega

import (
	"fmt"
	"strconv"
	"strings"
)

// The channel options of the WebUI (set_channel_option.tcl)
var channelOptions = map[string]bool{"visible": true, "usable": true, "logged": true}

// SetChannelOption sets visible, usable or logged of a channel; SetOK with
// the channel name, or SetNotFound.
func (c *Client) SetChannelOption(id int64, option string, value bool) (result, name string, err error) {
	if !channelOptions[option] {
		return "", "", fmt.Errorf("invalid option")
	}
	script := strings.NewReplacer(
		"{{ID}}", strconv.FormatInt(id, 10),
		"{{OPTION}}", option,
		"{{VALUE}}", strconv.FormatBool(value),
	).Replace(setChannelOptionScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// GetReadOnlyChannels returns the addresses of the channels
// non-administrators may not operate.
func (c *Client) GetReadOnlyChannels() (map[string]bool, error) {
	output, err := c.Execute(getReadOnlyChannelsScript)
	if err != nil {
		return nil, err
	}
	addresses := map[string]bool{}
	for _, line := range strings.Split(output, "\n") {
		if address := strings.TrimSpace(line); address != "" {
			addresses[address] = true
		}
	}
	return addresses, nil
}
