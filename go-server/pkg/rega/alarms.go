package rega

import (
	"strconv"
	"strings"
)

// AlarmMessage is a triggered alarm system variable that is not yet
// acknowledged, as the WebUI lists them under "Alarmmeldungen".
type AlarmMessage struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// Whether the variable is still set (the alarm may be over but not
	// acknowledged yet)
	Active  bool  `json:"active"`
	Counter int64 `json:"counter"`
	// When it was first and last triggered
	FirstTime string `json:"firstTime,omitempty"`
	LastTime  string `json:"lastTime,omitempty"`
	// The channel that triggered it, and its room
	Channel  string `json:"channel,omitempty"`
	RoomName string `json:"roomName,omitempty"`
	// The variable's value name, e.g. "ausgelöst"
	Message string `json:"message,omitempty"`
}

func parseAlarmMessages(output string) []AlarmMessage {
	isRecord := func(line string) bool { return strings.HasPrefix(line, "A\t") }
	messages := []AlarmMessage{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 10 {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		counter, _ := strconv.ParseInt(fields[3], 10, 64)
		messages = append(messages, AlarmMessage{
			ID: id, Active: fields[2] == "true", Counter: counter, FirstTime: fields[4], LastTime: fields[5],
			Channel: fields[6], RoomName: fields[7], Message: fields[8], Name: rejoin(fields, 9),
		})
	}
	return messages
}

// GetAlarmMessages returns the alarms waiting to be acknowledged.
func (c *Client) GetAlarmMessages() ([]AlarmMessage, error) {
	output, err := c.Execute(getAlarmMessagesScript)
	if err != nil {
		return nil, err
	}
	return parseAlarmMessages(output), nil
}

// AcknowledgeAlarmMessage acknowledges an alarm. Returns SetOK with its
// name, or SetNotFound.
func (c *Client) AcknowledgeAlarmMessage(id int64) (result, name string, err error) {
	output, err := c.Execute(strings.ReplaceAll(acknowledgeAlarmMessageScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
