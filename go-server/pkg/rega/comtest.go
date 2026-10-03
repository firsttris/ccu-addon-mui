package rega

import (
	"fmt"
	"regexp"
	"strings"
)

// The start time a function test is identified by
var comTestTimeRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`)

// StartComTest starts a device's function test and returns its start time
// (start_com_test.tcl); SetOK or SetNotFound.
func (c *Client) StartComTest(address string) (result, started string, err error) {
	if !safeIdentifierRegex.MatchString(address) || strings.Contains(address, ":") {
		return "", "", fmt.Errorf("invalid address")
	}
	output, err := c.Execute(strings.ReplaceAll(startComTestScript, "{{ADDRESS}}", address))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// PollComTest returns when the device answered the test started at since,
// "" while it hasn't (poll_com_test.tcl).
func (c *Client) PollComTest(address, since string) (result, answered string, err error) {
	if !safeIdentifierRegex.MatchString(address) || strings.Contains(address, ":") {
		return "", "", fmt.Errorf("invalid address")
	}
	if !comTestTimeRegex.MatchString(since) {
		return "", "", fmt.Errorf("invalid start time")
	}
	output, err := c.Execute(strings.NewReplacer("{{ADDRESS}}", address, "{{SINCE}}", since).Replace(pollComTestScript))
	if err != nil {
		return "", "", err
	}
	result, answered, err = resultWithValue(output)
	return result, strings.TrimSpace(answered), err
}
