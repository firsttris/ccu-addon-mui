package rega

import (
	"fmt"
	"strconv"
	"strings"
)

// Lists of groups: rooms and trades
const (
	ListRooms  = "rooms"
	ListTrades = "trades"
)

// groupList returns the ReGa id constant and enum type of a list.
func groupList(list string) (listID, enumType string, err error) {
	switch list {
	case ListRooms:
		return "ID_ROOMS", "etRoom", nil
	case ListTrades:
		return "ID_FUNCTIONS", "etFunction", nil
	}
	return "", "", fmt.Errorf("invalid list")
}

// resultWithValue splits "OK\t<value>" or "NOT_FOUND" from a script.
func resultWithValue(output string) (result, value string, err error) {
	result, value, _ = strings.Cut(strings.TrimRight(output, "\r\n"), "\t")
	if result != SetOK && result != SetNotFound {
		return "", "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
	return result, value, nil
}

// resultOnly checks "OK" or "NOT_FOUND" from a script.
func resultOnly(output string) (string, error) {
	result := strings.TrimSpace(output)
	if result != SetOK && result != SetNotFound {
		return "", fmt.Errorf("unexpected response from ReGa: %q", output)
	}
	return result, nil
}

// CreateGroup creates a room or trade and returns SetOK with its id.
func (c *Client) CreateGroup(list, name string) (result string, id int64, err error) {
	listID, enumType, err := groupList(list)
	if err != nil {
		return "", 0, err
	}
	if err := validateName(name); err != nil {
		return "", 0, err
	}
	script := strings.ReplaceAll(createGroupScript, "{{LIST_ID}}", listID)
	script = strings.ReplaceAll(script, "{{ENUM_TYPE}}", enumType)
	script = strings.ReplaceAll(script, "{{NAME}}", name)
	output, err := c.Execute(script)
	if err != nil {
		return "", 0, err
	}
	result, value, err := resultWithValue(output)
	if err != nil || result != SetOK {
		return result, 0, err
	}
	id, err = strconv.ParseInt(value, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("unexpected id from ReGa: %q", value)
	}
	return result, id, nil
}

// RenameGroup renames a room or trade and returns SetOK with the previous
// name, or SetNotFound.
func (c *Client) RenameGroup(list string, id int64, name string) (result, previous string, err error) {
	listID, _, err := groupList(list)
	if err != nil {
		return "", "", err
	}
	if err := validateName(name); err != nil {
		return "", "", err
	}
	script := strings.ReplaceAll(renameGroupScript, "{{LIST_ID}}", listID)
	script = strings.ReplaceAll(script, "{{ID}}", strconv.FormatInt(id, 10))
	script = strings.ReplaceAll(script, "{{NAME}}", name)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// DeleteGroup deletes a room or trade and returns SetOK with its name, or
// SetNotFound. Its channels stay, they just no longer belong to it.
func (c *Client) DeleteGroup(list string, id int64) (result, previous string, err error) {
	listID, _, err := groupList(list)
	if err != nil {
		return "", "", err
	}
	script := strings.ReplaceAll(deleteGroupScript, "{{LIST_ID}}", listID)
	script = strings.ReplaceAll(script, "{{ID}}", strconv.FormatInt(id, 10))
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// NewSysvar describes a system variable to create.
type NewSysvar struct {
	Name string `json:"name"`
	// bool, alarm, number, enum or string
	Kind      string   `json:"kind"`
	Unit      string   `json:"unit,omitempty"`
	Min       *float64 `json:"min,omitempty"`
	Max       *float64 `json:"max,omitempty"`
	FalseName string   `json:"falseName,omitempty"`
	TrueName  string   `json:"trueName,omitempty"`
	ValueList []string `json:"valueList,omitempty"`
}

// validateText guards an optional text (unit, value names) substituted
// into a string literal.
func validateText(text string) error {
	if len(text) > 100 || strings.ContainsAny(text, "\"\\\r\n\t") {
		return fmt.Errorf("invalid text")
	}
	return nil
}

// CreateSysvar creates a system variable and returns SetOK with its id.
func (c *Client) CreateSysvar(sv NewSysvar) (result string, id int64, err error) {
	if err := validateName(sv.Name); err != nil {
		return "", 0, err
	}
	for _, text := range []string{sv.Unit, sv.FalseName, sv.TrueName} {
		if err := validateText(text); err != nil {
			return "", 0, err
		}
	}
	for _, option := range sv.ValueList {
		if err := validateName(option); err != nil || strings.Contains(option, ";") {
			return "", 0, fmt.Errorf("invalid value list")
		}
	}
	objectType, valueType, subType, initial := "OT_VARDP", 0, 0, "0"
	minValue, maxValue := 0.0, 0.0
	switch sv.Kind {
	case "bool":
		valueType, subType, initial = 2, 2, "false"
	case "alarm":
		objectType, valueType, subType, initial = "OT_ALARMDP", 2, 6, "false"
	case "number":
		valueType, subType = 4, 0
		minValue, maxValue = -65535, 65535
		if sv.Min != nil {
			minValue = *sv.Min
		}
		if sv.Max != nil {
			maxValue = *sv.Max
		}
		if minValue >= maxValue {
			return "", 0, fmt.Errorf("invalid range")
		}
		initial = strconv.FormatFloat(minValue, 'f', -1, 64)
		if minValue < 0 && maxValue > 0 {
			initial = "0"
		}
	case "enum":
		if len(sv.ValueList) == 0 {
			return "", 0, fmt.Errorf("invalid value list")
		}
		valueType, subType = 16, 29
		maxValue = float64(len(sv.ValueList) - 1)
	case "string":
		valueType, subType, initial = 20, 11, `""`
	default:
		return "", 0, fmt.Errorf("invalid kind")
	}
	replacer := strings.NewReplacer(
		"{{OBJECT_TYPE}}", objectType,
		"{{NAME}}", sv.Name,
		"{{VALUE_TYPE}}", strconv.Itoa(valueType),
		"{{SUB_TYPE}}", strconv.Itoa(subType),
		"{{UNIT}}", sv.Unit,
		"{{MIN}}", strconv.FormatFloat(minValue, 'f', -1, 64),
		"{{MAX}}", strconv.FormatFloat(maxValue, 'f', -1, 64),
		"{{FALSE_NAME}}", sv.FalseName,
		"{{TRUE_NAME}}", sv.TrueName,
		"{{VALUE_LIST}}", strings.Join(sv.ValueList, ";"),
		"{{INITIAL}}", initial,
	)
	output, err := c.Execute(replacer.Replace(createSysvarScript))
	if err != nil {
		return "", 0, err
	}
	result, value, err := resultWithValue(output)
	if err != nil || result != SetOK {
		return result, 0, err
	}
	id, err = strconv.ParseInt(value, 10, 64)
	if err != nil {
		return "", 0, fmt.Errorf("unexpected id from ReGa: %q", value)
	}
	return result, id, nil
}

// RenameSysvar renames a system variable and returns SetOK with the
// previous name, or SetNotFound.
func (c *Client) RenameSysvar(id int64, name string) (result, previous string, err error) {
	if err := validateName(name); err != nil {
		return "", "", err
	}
	script := strings.ReplaceAll(renameSysvarScript, "{{ID}}", strconv.FormatInt(id, 10))
	script = strings.ReplaceAll(script, "{{NAME}}", name)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// DeleteSysvar deletes a system variable and returns SetOK with its name,
// or SetNotFound.
func (c *Client) DeleteSysvar(id int64) (result, previous string, err error) {
	output, err := c.Execute(strings.ReplaceAll(deleteSysvarScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// EditSysvar changes a system variable's settings: description, unit,
// names of true and false, range or value list as its kind has them. The
// kind is the variable's (sv.Kind only picks the checks). Returns SetOK or
// SetNotFound.
func (c *Client) EditSysvar(id int64, sv NewSysvar, description string, channel int64) (string, error) {
	if channel < 0 {
		return "", fmt.Errorf("invalid channel")
	}
	for _, text := range []string{sv.Unit, sv.FalseName, sv.TrueName} {
		if err := validateText(text); err != nil {
			return "", err
		}
	}
	if len(description) > 1000 || strings.Contains(description, "^") {
		return "", fmt.Errorf("invalid description")
	}
	for _, option := range sv.ValueList {
		if err := validateName(option); err != nil || strings.Contains(option, ";") {
			return "", fmt.Errorf("invalid value list")
		}
	}
	minValue, maxValue := -65535.0, 65535.0
	if sv.Min != nil {
		minValue = *sv.Min
	}
	if sv.Max != nil {
		maxValue = *sv.Max
	}
	switch sv.Kind {
	case "number":
		if minValue >= maxValue {
			return "", fmt.Errorf("invalid range")
		}
	case "enum":
		if len(sv.ValueList) == 0 {
			return "", fmt.Errorf("invalid value list")
		}
		minValue, maxValue = 0, float64(len(sv.ValueList)-1)
	case "bool", "alarm", "string":
	default:
		return "", fmt.Errorf("invalid kind")
	}
	script := strings.NewReplacer(
		"{{ID}}", strconv.FormatInt(id, 10),
		"{{INFO}}", description,
		"{{CHANNEL}}", strconv.FormatInt(channel, 10),
		"{{UNIT}}", sv.Unit,
		"{{MIN}}", strconv.FormatFloat(minValue, 'f', -1, 64),
		"{{MAX}}", strconv.FormatFloat(maxValue, 'f', -1, 64),
		"{{FALSE_NAME}}", sv.FalseName,
		"{{TRUE_NAME}}", sv.TrueName,
		"{{VALUE_LIST}}", strings.Join(sv.ValueList, ";"),
	).Replace(editSysvarScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	return resultOnly(output)
}
