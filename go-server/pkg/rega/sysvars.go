package rega

import (
	"fmt"
	"strconv"
	"strings"
)

// ReGa value types and sub types of system variables
const (
	valueTypeString  = "20"
	subTypeEnum      = "29"
	subTypeAlarm     = "6"
	subTypePresence  = "23"
	subTypeCharacter = "11"
)

// Sysvar is a system variable.
type Sysvar struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Visible bool   `json:"visible"`
	// Description is the variable's info text (DPInfo)
	Description string `json:"description,omitempty"`
	// Channel is the id of the channel the variable belongs to (0: none)
	Channel int64 `json:"channel,omitempty"`
	// Kind is "bool", "alarm", "number", "enum" or "string"
	Kind  string   `json:"kind"`
	Unit  string   `json:"unit,omitempty"`
	Min   *float64 `json:"min,omitempty"`
	Max   *float64 `json:"max,omitempty"`
	Value any      `json:"value"`
	// Names of false and true (bool, alarm)
	FalseName string `json:"falseName,omitempty"`
	TrueName  string `json:"trueName,omitempty"`
	// Values of an enum; the value is the index
	ValueList []string `json:"valueList,omitempty"`
}

func sysvarKind(valueType, subType string) string {
	switch {
	case valueType == valueTypeBool && subType == subTypeAlarm:
		return "alarm"
	case valueType == valueTypeBool:
		return "bool"
	case valueType == valueTypeInteger && subType == subTypeEnum:
		return "enum"
	case valueType == valueTypeString || subType == subTypeCharacter:
		return "string"
	}
	return "number"
}

func parseFloatPtr(s string) *float64 {
	if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
		return &f
	}
	return nil
}

// parseSysvars parses the output of get_sysvars.tcl.
func parseSysvars(output string) []Sysvar {
	isRecord := func(line string) bool {
		return len(line) >= 2 && line[1] == '\t' && strings.ContainsRune("VTRBLXIC", rune(line[0]))
	}
	sysvars := []Sysvar{}
	var valueType, subType string
	for _, fields := range splitRecords(output, isRecord) {
		if fields[0] == "V" {
			if len(fields) < 4 {
				continue
			}
			id, err := strconv.ParseInt(fields[1], 10, 64)
			if err != nil {
				continue
			}
			sysvars = append(sysvars, Sysvar{ID: id, Visible: fields[2] == "true", Name: rejoin(fields, 3)})
			continue
		}
		if len(sysvars) == 0 {
			continue
		}
		sv := &sysvars[len(sysvars)-1]
		switch fields[0] {
		case "T":
			if len(fields) >= 3 {
				valueType, subType = fields[1], fields[2]
				sv.Kind = sysvarKind(valueType, subType)
				sv.Unit = rejoin(fields, 3)
			}
		case "R":
			if len(fields) >= 3 && sv.Kind == "number" {
				sv.Min, sv.Max = parseFloatPtr(fields[1]), parseFloatPtr(fields[2])
			}
		case "B":
			if len(fields) >= 3 && (sv.Kind == "bool" || sv.Kind == "alarm") {
				sv.FalseName, sv.TrueName = fields[1], rejoin(fields, 2)
			}
		case "L":
			if sv.Kind == "enum" {
				sv.ValueList = strings.Split(rejoin(fields, 1), ";")
			}
		case "I":
			sv.Description = decodeText(rejoin(fields, 1))
		case "C":
			if len(fields) >= 2 {
				sv.Channel, _ = strconv.ParseInt(fields[1], 10, 64)
			}
		case "X":
			raw := rejoin(fields, 1)
			switch sv.Kind {
			case "string":
				sv.Value = raw
			case "enum":
				sv.Value = parseValue(valueTypeInteger, raw)
			default:
				sv.Value = parseValue(valueType, raw)
			}
		}
	}
	return sysvars
}

// GetSysvars returns all system variables.
func (c *Client) GetSysvars() ([]Sysvar, error) {
	output, err := c.Execute(getSysvarsScript)
	if err != nil {
		return nil, err
	}
	return parseSysvars(output), nil
}

// SetSysvar sets a system variable and returns SetOK with the previous
// value, or SetNotFound. text: the value is a string variable's text, which
// is always written as a string literal, even when it looks like a number
// ("007") or a boolean.
func (c *Client) SetSysvar(id int64, value string, text bool) (result, previous string, err error) {
	var regaValue string
	if text {
		regaValue, err = quoteRegaText(value)
	} else {
		regaValue, err = sanitizeRegaValue(value)
	}
	if err != nil {
		return "", "", err
	}
	script := strings.ReplaceAll(setSysvarScript, "{{ID}}", strconv.FormatInt(id, 10))
	script = strings.ReplaceAll(script, "{{VALUE}}", regaValue)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// Program is a ReGa program.
type Program struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Active  bool   `json:"active"`
	Visible bool   `json:"visible"`
	// Operate: users other than administrators may run it ("bedienbar")
	Operate bool `json:"operate"`
	// Internal: a system-internal program (the WebUI lists them on request)
	Internal bool `json:"internal,omitempty"`
}

// GetPrograms returns all programs.
func (c *Client) GetPrograms() ([]Program, error) {
	output, err := c.Execute(getProgramsScript)
	if err != nil {
		return nil, err
	}
	isRecord := func(line string) bool { return strings.HasPrefix(line, "P\t") }
	programs := []Program{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 7 {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		programs = append(programs, Program{
			ID: id, Active: fields[2] == "true", Visible: fields[3] == "true", Operate: fields[4] == "true",
			Internal: fields[5] == "true", Name: rejoin(fields, 6),
		})
	}
	return programs, nil
}

// Program actions
const (
	ProgramRun = "run"
	ProgramOn  = "on"
	ProgramOff = "off"
)

// ProgramAction runs a program or switches it on or off. Returns SetOK or
// SetNotFound.
func (c *Client) ProgramAction(id int64, action string) (string, error) {
	if action != ProgramRun && action != ProgramOn && action != ProgramOff {
		return "", fmt.Errorf("invalid program action")
	}
	script := strings.ReplaceAll(programActionScript, "{{ID}}", strconv.FormatInt(id, 10))
	script = strings.ReplaceAll(script, "{{ACTION}}", action)
	output, err := c.Execute(script)
	if err != nil {
		return "", err
	}
	return resultOnly(output)
}

// SetLogicOption sets "visible" of a program or system variable, or
// "operate" of a program. Returns SetOK with the previous value, or
// SetNotFound.
func (c *Client) SetLogicOption(id int64, option string, value bool) (string, bool, error) {
	if option != "visible" && option != "operate" {
		return "", false, fmt.Errorf("invalid option")
	}
	script := strings.NewReplacer("{{ID}}", strconv.FormatInt(id, 10), "{{OPTION}}", option, "{{VALUE}}", strconv.FormatBool(value)).
		Replace(setLogicOptionScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", false, err
	}
	result, previous, err := resultWithValue(output)
	return result, previous == "true", err
}
