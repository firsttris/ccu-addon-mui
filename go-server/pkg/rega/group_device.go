package rega

import (
	"fmt"
	"strings"
)

// SetupGroupDevice does in ReGa what the WebUI does after saving a heating
// group (setup_group_device.tcl): names the group's virtual device and its
// channels (if rename), takes it out of the inbox and marks the devices
// in the group and those no longer in it. Returns SetOK, or SetNotFound
// while the virtual device is not there yet.
func (c *Client) SetupGroupDevice(address, name string, rename bool, members, others []string) (string, error) {
	if !safeIdentifierRegex.MatchString(address) {
		return "", fmt.Errorf("invalid address")
	}
	if rename {
		if err := validateName(name); err != nil {
			return "", err
		}
	}
	for _, list := range [][]string{members, others} {
		for _, a := range list {
			if !safeIdentifierRegex.MatchString(a) {
				return "", fmt.Errorf("invalid address")
			}
		}
	}
	flag := "0"
	if rename {
		flag = "1"
	}
	script := strings.NewReplacer(
		"{{ADDRESS}}", address, "{{NAME}}", name, "{{RENAME}}", flag,
		"{{MEMBERS}}", strings.Join(members, "\t"), "{{OTHERS}}", strings.Join(others, "\t"),
	).Replace(setupGroupDeviceScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	return resultOnly(output)
}
