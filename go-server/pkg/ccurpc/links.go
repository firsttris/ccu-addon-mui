package ccurpc

import "strings"

// Link is a direct link between two channels: the sender (e.g. a button)
// controls the receiver (e.g. a switch) without the CCU.
type Link struct {
	Sender      string `json:"sender"`
	Receiver    string `json:"receiver"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

// getLinks flag: links of all channels of a device
const linkFlagGroup = 1

func isChannel(address string) bool {
	return addressRegex.MatchString(address) && strings.Contains(address, ":")
}

// GetLinks returns the links of a device (all its channels) or a channel.
func (c *Client) GetLinks(iface, address string) ([]Link, error) {
	if !addressRegex.MatchString(address) {
		return nil, ErrInvalidAddress
	}
	flags := 0
	if !strings.Contains(address, ":") {
		flags = linkFlagGroup
	}
	var reply []interface{}
	if err := c.call(iface, "getLinks", []interface{}{address, flags}, &reply); err != nil {
		return nil, err
	}
	links := []Link{}
	seen := map[string]bool{}
	for _, raw := range reply {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		link := Link{Sender: asString(m["SENDER"]), Receiver: asString(m["RECEIVER"]), Name: asString(m["NAME"]), Description: asString(m["DESCRIPTION"])}
		// A link between two channels of the device is listed twice
		if key := link.Sender + ">" + link.Receiver; !seen[key] {
			seen[key] = true
			links = append(links, link)
		}
	}
	return links, nil
}

// AddLink links two channels.
func (c *Client) AddLink(iface, sender, receiver, name, description string) error {
	if !isChannel(sender) || !isChannel(receiver) {
		return ErrInvalidAddress
	}
	var reply interface{}
	return c.call(iface, "addLink", []interface{}{sender, receiver, name, description}, &reply)
}

// RemoveLink deletes a link.
func (c *Client) RemoveLink(iface, sender, receiver string) error {
	if !isChannel(sender) || !isChannel(receiver) {
		return ErrInvalidAddress
	}
	var reply interface{}
	return c.call(iface, "removeLink", []interface{}{sender, receiver}, &reply)
}

// GetLinkParamsetDescription describes the parameters of a link on the
// side of address (usually the receiver); partner is the other channel.
func (c *Client) GetLinkParamsetDescription(iface, address, partner string) (ParamsetDescription, error) {
	if !isChannel(address) || !isChannel(partner) {
		return nil, ErrInvalidAddress
	}
	var reply map[string]interface{}
	if err := c.call(iface, "getParamsetDescription", []interface{}{address, partner}, &reply); err != nil {
		return nil, err
	}
	return parseParamsetDescription(reply), nil
}

// GetLinkParamset returns the parameters of a link on the side of address.
func (c *Client) GetLinkParamset(iface, address, partner string) (map[string]interface{}, error) {
	if !isChannel(address) || !isChannel(partner) {
		return nil, ErrInvalidAddress
	}
	var reply map[string]interface{}
	if err := c.call(iface, "getParamset", []interface{}{address, partner}, &reply); err != nil {
		return nil, err
	}
	if reply == nil {
		reply = map[string]interface{}{}
	}
	return reply, nil
}

// PutLinkParamset writes link parameters (checked with CoerceValues).
func (c *Client) PutLinkParamset(iface, address, partner string, values map[string]interface{}) error {
	if !isChannel(address) || !isChannel(partner) {
		return ErrInvalidAddress
	}
	var reply interface{}
	return c.call(iface, "putParamset", []interface{}{address, partner, values}, &reply)
}

// GetAllLinks returns every link of an interface, as the WebUI's list of
// direct links asks for them (ic_common.tcl: getLinks "" with flags).
func (c *Client) GetAllLinks(iface string) ([]Link, error) {
	var reply []interface{}
	if err := c.call(iface, "getLinks", []interface{}{"", 0}, &reply); err != nil {
		return nil, err
	}
	links := []Link{}
	for _, raw := range reply {
		if m, ok := raw.(map[string]interface{}); ok {
			links = append(links, Link{Sender: asString(m["SENDER"]), Receiver: asString(m["RECEIVER"]), Name: asString(m["NAME"]), Description: asString(m["DESCRIPTION"])})
		}
	}
	return links, nil
}
