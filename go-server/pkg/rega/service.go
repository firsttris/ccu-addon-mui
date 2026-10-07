package rega

import (
	"ccu-addon-mui-server/pkg/home"
	"strconv"
	"strings"
)

type ServiceMessage = home.ServiceMessage

func parseServiceMessages(output string) []ServiceMessage {
	isRecord := func(line string) bool { return strings.HasPrefix(line, "S\t") }
	messages := []ServiceMessage{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 9 {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		roomID, _ := strconv.ParseInt(fields[6], 10, 64)
		message := ServiceMessage{
			ID: id, Type: fields[2], Value: fields[3], Timestamp: fields[4], Address: fields[5],
			RoomID: roomID, RoomName: fields[7], Name: rejoin(fields, 8),
		}
		// Booleans say nothing beyond the type
		if message.Value == "true" || message.Value == "false" {
			message.Value = ""
		}
		if message.Name == "" {
			message.Name = message.Address
		}
		messages = append(messages, message)
	}
	return messages
}

// GetServiceMessages returns the active service messages.
func (c *Client) GetServiceMessages() ([]ServiceMessage, error) {
	output, err := c.Execute(getServiceMessagesScript)
	if err != nil {
		return nil, err
	}
	return parseServiceMessages(output), nil
}

// AcknowledgeServiceMessage acknowledges a service message (sticky ones,
// like a past unreachability, then go away). Returns SetOK with its type,
// or SetNotFound.
func (c *Client) AcknowledgeServiceMessage(id int64) (result, messageType string, err error) {
	output, err := c.Execute(strings.ReplaceAll(acknowledgeServiceMessageScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
