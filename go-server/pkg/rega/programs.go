package rega

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// The program editor: a program as its WENN / SONST WENN / SONST rules, read
// and written the way the WebUI's program editor does it
// (rega/esp/programs.fn, rule.inc, sico.fn, dest.fn in OpenCCU-Base).
// Value types and condition kinds are ReGa constant names (ivtObjectId, ...)
// or "N:<number>" for values without a known name, so programs the editor
// doesn't fully understand are written back unchanged.

// ProgramDefinition is a whole program.
type ProgramDefinition struct {
	// 0 for a new program
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Active      bool   `json:"active"`
	// The WENN rule, then each SONST WENN
	Rules []ProgramRule `json:"rules"`
	// The SONST branch, if any
	Else *ProgramBranch `json:"else,omitempty"`
}

// ProgramBranch is what a rule does (DANN) or the SONST branch.
type ProgramBranch struct {
	// "Vor dem Ausführen alle laufenden Verzögerungen beenden"
	BreakOnRestart bool                 `json:"breakOnRestart"`
	Destinations   []ProgramDestination `json:"destinations"`
}

// ProgramRule is a WENN or SONST WENN with its DANN.
type ProgramRule struct {
	// How the condition groups are joined, "or" (the WebUI's default) or
	// "and"; the conditions within a group are joined the other way.
	GroupOperator string               `json:"groupOperator"`
	Groups        [][]ProgramCondition `json:"groups"`
	ProgramBranch
}

// ProgramCondition is a single condition.
type ProgramCondition struct {
	// ivtObjectId (a device datapoint), ivtSystemId (a system variable),
	// ivtCurrentDate (a time module) or ivtEmpty
	LeftType string `json:"leftType"`
	// The datapoint or system variable, and the channel (devices)
	LeftValue int64 `json:"leftValue"`
	Channel   int64 `json:"channel"`
	// The datapoint's name (STATE, ...); when set with the channel it is
	// written instead of LeftValue
	Datapoint string `json:"datapoint,omitempty"`
	// ConditionType: 1 equal, 5 equal (number), 6 range, 8 >, 9 >=, 10 <, 11 <=
	Compare int `json:"compare"`
	// ConditionType2: 4 on change, 13 on update (time: at the times), 15 check only
	Trigger    int    `json:"trigger"`
	Value1Type string `json:"value1Type"`
	Value1     string `json:"value1"`
	Value2Type string `json:"value2Type"`
	Value2     string `json:"value2"`
	// The time module of an ivtCurrentDate condition
	Time *TimeModule `json:"time,omitempty"`
}

// TimeModule is a time module (OT_CALENDARDP) as the WebUI's time module
// dialog writes it (rega/esp/system.fn, saveTimeModule).
type TimeModule struct {
	// 0 for a new one
	ID int64 `json:"id"`
	// Changed (or new) modules are written; others are only referred to
	Changed bool `json:"changed,omitempty"`
	// 8 once, 4 periodic, 9 daily, 5 weekly, 6 monthly, 7 yearly
	TimerType int `json:"timerType"`
	// "2007-01-01 HH:MM:SS": the time, or the start of a range
	Time string `json:"time"`
	// Length of a range in seconds, 0 for a point in time
	Duration int `json:"duration"`
	// 0 none, 3 during the day, 6 during the night
	SunOffset int `json:"sunOffset"`
	Period    int `json:"period"`
	// Mo 1, Tu 2, We 4, Th 8, Fr 16, Sa 32, Su 64
	Weekdays        int    `json:"weekdays"`
	RepetitionValue int    `json:"repetitionValue"`
	Begin           string `json:"begin"`
	End             string `json:"end"`
	RepetitionCount int    `json:"repetitionCount"`
	RepeatTime      string `json:"repeatTime"`
}

// ProgramDestination is a single action.
type ProgramDestination struct {
	// ivtObjectId (a device datapoint), ivtSystemId (a system variable),
	// ivtString (a script) or ivtEmpty
	Param   string `json:"param"`
	Channel int64  `json:"channel"`
	// The datapoint or system variable (DestinationDP), and the datapoint's
	// name, written instead of the id when set with the channel
	DatapointID int64  `json:"datapointId"`
	Datapoint   string `json:"datapoint,omitempty"`
	ValueType   string `json:"valueType"`
	Value       string `json:"value"`
	// Delay in seconds, 0 for at once
	Delay int `json:"delay"`
}

// The ReGa constants the editor writes by name
var programConstants = []string{
	"ivtEmpty", "ivtNull", "ivtBinary", "ivtFloat", "ivtInteger", "ivtString", "ivtObjectId",
	"ivtSystemId", "ivtSpecialValue", "ivtCurrentDate", "ivtDelay",
}

func decodeText(s string) string {
	if decoded, err := url.PathUnescape(s); err == nil {
		return decoded
	}
	return s
}

func atoi(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	return n
}

// delaySeconds reads a delay as ReGa prints it ("YYYY-MM-DD HH:MM:SS",
// parsed like the WebUI's dest.inc with Substr(11,2) etc.).
func delaySeconds(s string) int {
	if len(s) < 19 {
		return 0
	}
	return atoi(s[11:13])*3600 + atoi(s[14:16])*60 + atoi(s[17:19])
}

// programParser is what parseProgram has read so far: the type names of
// the constants ("K" lines), the program, and the rule and branch the next
// lines belong to
type programParser struct {
	names   map[string]string
	program *ProgramDefinition
	rule    *ProgramRule
	branch  *ProgramBranch
}

func (p *programParser) typeName(raw string) string {
	if name, ok := p.names[strings.TrimSpace(raw)]; ok {
		return name
	}
	return "N:" + strings.TrimSpace(raw)
}

// The lines of getProgramScript by their first field; a line too short or
// out of place is skipped
var programLines = map[string]func(p *programParser, fields []string){
	// A constant's value and name
	"K": func(p *programParser, fields []string) {
		if len(fields) == 3 {
			p.names[fields[2]] = fields[1]
		}
	},
	"P": func(p *programParser, fields []string) {
		if len(fields) >= 5 {
			p.program = &ProgramDefinition{
				ID: atoi64(fields[1]), Active: fields[2] == "true", Name: rejoin(fields, 4), Rules: []ProgramRule{},
			}
		}
	},
	// The description
	"I": func(p *programParser, fields []string) {
		if p.program != nil {
			p.program.Description = decodeText(rejoin(fields, 1))
		}
	},
	// A rule ("true") or the else branch
	"R": func(p *programParser, fields []string) {
		if p.program == nil || len(fields) < 3 {
			return
		}
		branch := ProgramBranch{BreakOnRestart: fields[2] == "true", Destinations: []ProgramDestination{}}
		if fields[1] != "true" {
			p.program.Else = &branch
			p.rule, p.branch = nil, p.program.Else
			return
		}
		p.program.Rules = append(p.program.Rules, ProgramRule{GroupOperator: "or", Groups: [][]ProgramCondition{}, ProgramBranch: branch})
		p.rule = &p.program.Rules[len(p.program.Rules)-1]
		p.branch = &p.rule.ProgramBranch
	},
	// A group of conditions
	"G": func(p *programParser, fields []string) {
		if p.rule == nil || len(fields) < 2 {
			return
		}
		// The operator to the next group, set on every group
		if len(p.rule.Groups) == 0 && atoi(fields[1]) == 1 {
			p.rule.GroupOperator = "and"
		}
		p.rule.Groups = append(p.rule.Groups, []ProgramCondition{})
	},
	// A condition of the last group
	"S": func(p *programParser, fields []string) {
		if p.rule == nil || len(p.rule.Groups) == 0 || len(fields) < 12 {
			return
		}
		g := len(p.rule.Groups) - 1
		p.rule.Groups[g] = append(p.rule.Groups[g], ProgramCondition{
			LeftType: p.typeName(fields[2]), LeftValue: atoi64(fields[3]), Channel: atoi64(fields[4]), Datapoint: fields[5],
			Compare: atoi(fields[6]), Trigger: atoi(fields[7]),
			Value1Type: p.typeName(fields[8]), Value2Type: p.typeName(fields[9]),
			Value1: decodeText(fields[10]), Value2: decodeText(fields[11]),
		})
	},
	// The time module of the last condition
	"T": func(p *programParser, fields []string) {
		if p.rule == nil || len(p.rule.Groups) == 0 || len(fields) < 13 {
			return
		}
		group := p.rule.Groups[len(p.rule.Groups)-1]
		if len(group) == 0 {
			return
		}
		group[len(group)-1].Time = &TimeModule{
			ID: atoi64(fields[1]), TimerType: atoi(fields[2]), Time: fields[3], Duration: atoi(fields[4]),
			SunOffset: atoi(fields[5]), Period: atoi(fields[6]), Weekdays: atoi(fields[7]),
			RepetitionValue: atoi(fields[8]), Begin: fields[9], End: fields[10],
			RepetitionCount: atoi(fields[11]), RepeatTime: fields[12],
		}
	},
	// A destination of the current branch
	"D": func(p *programParser, fields []string) {
		if p.branch == nil || len(fields) < 9 {
			return
		}
		delay := 0
		if p.typeName(fields[6]) == "ivtDelay" {
			delay = delaySeconds(fields[7])
		}
		p.branch.Destinations = append(p.branch.Destinations, ProgramDestination{
			Param: p.typeName(fields[1]), Channel: atoi64(fields[2]), DatapointID: atoi64(fields[3]), Datapoint: fields[4],
			ValueType: p.typeName(fields[5]), Delay: delay, Value: decodeText(rejoin(fields, 8)),
		})
	},
}

func parseProgram(output string) (*ProgramDefinition, error) {
	p := &programParser{names: map[string]string{}}
	for _, line := range strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n") {
		fields := strings.Split(line, "\t")
		if parse, ok := programLines[fields[0]]; ok {
			parse(p, fields)
		}
	}
	if p.program == nil {
		// The constants come first, then NOT_FOUND
		if strings.HasSuffix(strings.TrimSpace(output), SetNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("unexpected response from ReGa: %q", output)
	}
	return p.program, nil
}

// GetProgram returns a program with its rules, or nil if there is none.
func (c *Client) GetProgram(id int64) (*ProgramDefinition, error) {
	output, err := c.Execute(strings.ReplaceAll(getProgramScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return nil, err
	}
	return parseProgram(output)
}

// --- Writing

var (
	scriptNumberRegex = regexp.MustCompile(`^-?[0-9]+(\.[0-9]+)?$`)
	rawTypeRegex      = regexp.MustCompile(`^N:-?[0-9]+$`)
	timeTextRegex     = regexp.MustCompile(`^[0-9: -]{0,19}$`)
	hssNameRegex      = regexp.MustCompile(`^[A-Z0-9_]{1,64}$`)
)

// datapointRef writes a datapoint: found by its name on the channel when
// both are known (the editor knows names, not ids), else its id.
func (w *scriptWriter) datapointRef(channel int64, name string, id int64) string {
	if channel > 0 && name != "" {
		if !hssNameRegex.MatchString(name) {
			w.fail(fmt.Errorf("invalid datapoint %q", name))
		}
		w.check(fmt.Sprintf("chk = dom.GetObject(%d);\nif (chk) { chkDP = chk.DPByHssDP(\"%s\"); if (chkDP) { } else { valid = false; } } else { valid = false; }", channel, name))
		return fmt.Sprintf(`dom.GetObject(%d).DPByHssDP("%s").ID()`, channel, name)
	}
	return strconv.FormatInt(id, 10)
}

// constant writes a type as a ReGa constant name or number.
func constant(name string) (string, error) {
	for _, known := range programConstants {
		if name == known {
			return name, nil
		}
	}
	if rawTypeRegex.MatchString(name) {
		return strings.TrimPrefix(name, "N:"), nil
	}
	return "", fmt.Errorf("invalid type %q", name)
}

// literal writes a value: a ^string^ for strings (ReGa has no escapes, so
// a ^ is refused), a number or true/false otherwise.
func literal(valueType, value string) (string, error) {
	if valueType == "ivtString" {
		if strings.Contains(value, "^") || len(value) > 20000 {
			return "", fmt.Errorf("invalid text value")
		}
		return "^" + value + "^", nil
	}
	if value == "" {
		return "0", nil
	}
	if value == "true" || value == "false" || scriptNumberRegex.MatchString(value) {
		return value, nil
	}
	return "", fmt.Errorf("invalid value %q", value)
}

type scriptWriter struct {
	b   strings.Builder
	err error
	// checks run before anything is created: a missing datapoint or time
	// module would abort the script halfway (null.ID()), see save_program.tcl
	checks []string
}

func (w *scriptWriter) check(code string) {
	for _, c := range w.checks {
		if c == code {
			return
		}
	}
	w.checks = append(w.checks, code)
}

func (w *scriptWriter) line(format string, args ...any) {
	fmt.Fprintf(&w.b, "    "+format+"\n", args...)
}

func (w *scriptWriter) fail(err error) {
	if w.err == nil && err != nil {
		w.err = err
	}
}

func (w *scriptWriter) constant(name string) string {
	c, err := constant(name)
	w.fail(err)
	return c
}

func (w *scriptWriter) literal(valueType, value string) string {
	l, err := literal(valueType, value)
	w.fail(err)
	return l
}

func (w *scriptWriter) branch(branch ProgramBranch) {
	w.line("rule.RuleDestination().BreakOnRestart(%t);", branch.BreakOnRestart)
	for _, d := range branch.Destinations {
		w.line("dest = rule.RuleDestination().DestAddSingle();")
		w.line("dest.DestinationParam(%s);", w.constant(d.Param))
		w.line("dest.DestinationChannel(%d);", d.Channel)
		w.line("dest.DestinationDP(%s);", w.datapointRef(d.Channel, d.Datapoint, d.DatapointID))
		w.line("dest.DestinationValueType(%s);", w.constant(d.ValueType))
		w.line("dest.DestinationValue(%s);", w.literal(d.ValueType, d.Value))
		if d.Delay > 0 {
			if d.Delay >= 100*3600 {
				w.fail(fmt.Errorf("invalid delay"))
			}
			// "HH:MM:SS" with two digits each, as the WebUI writes it
			w.line("dest.DestinationValueParamType(ivtDelay);")
			w.line(`dest.DestinationValueParam("%02d:%02d:%02d");`, d.Delay/3600, d.Delay/60%60, d.Delay%60)
		} else {
			w.line("dest.DestinationValueParamType(ivtEmpty);")
		}
	}
}

func (w *scriptWriter) timeModule(t *TimeModule) {
	if t.ID > 0 && !t.Changed {
		w.line("cond.RightVal1ValType(ivtObjectId);")
		w.line("cond.RightVal1(%d);", t.ID)
		return
	}
	for _, text := range []string{t.Time, t.Begin, t.End, t.RepeatTime} {
		if !timeTextRegex.MatchString(text) {
			w.fail(fmt.Errorf("invalid time %q", text))
		}
	}
	if t.ID > 0 {
		w.check(fmt.Sprintf("chk = dom.GetObject(%d);\nif (chk) { } else { valid = false; }", t.ID))
		w.line("tm = dom.GetObject(%d);", t.ID)
	} else {
		w.line(`tm = dom.CreateObject(OT_CALENDARDP, "Zeitmodul");`)
		w.line("dom.GetObject(ID_CALENDARDPS).Add(tm.ID());")
	}
	w.line("tm.TimerType(%d);", t.TimerType)
	w.line(`tm.Time("%s");`, t.Time)
	w.line("tm.CalDuration(%d);", t.Duration)
	w.line(`tm.CalRepeatTime("%s");`, t.RepeatTime)
	w.line("tm.Weekdays(%d);", t.Weekdays)
	w.line("tm.Period(%d);", t.Period)
	w.line("tm.CalRepetitionValue(%d);", t.RepetitionValue)
	w.line(`tm.Begin("%s");`, t.Begin)
	w.line(`tm.End("%s");`, t.End)
	w.line("tm.CalRepetitionCount(%d);", t.RepetitionCount)
	w.line("tm.SunOffsetType(%d);", t.SunOffset)
	w.line("cond.RightVal1ValType(ivtObjectId);")
	w.line("cond.RightVal1(tm.ID());")
}

// programCode writes the HM script that builds the rules on "program", and
// the checks that must set "valid" before it runs.
func programCode(p ProgramDefinition) (code, checks string, err error) {
	if len(p.Rules) == 0 {
		return "", "", fmt.Errorf("invalid program: no rule")
	}
	w := &scriptWriter{}
	for i, r := range p.Rules {
		if i > 0 {
			w.line("rule = rule.RuleCreateSubRule();")
		}
		w.line("rule.ElseIfFlag(true);")
		// Groups joined by one operator, the conditions in them by the other
		groupOp, singleOp := 2, 1
		if r.GroupOperator == "and" {
			groupOp, singleOp = 1, 2
		}
		for _, group := range r.Groups {
			if len(group) == 0 {
				continue
			}
			w.line("group = rule.RuleAddCondition();")
			w.line("group.CndOperatorType(%d);", groupOp)
			for _, c := range group {
				w.line("cond = group.CndAddSingle();")
				w.line("cond.OperatorType(%d);", singleOp)
				w.line("cond.LeftValType(%s);", w.constant(c.LeftType))
				if c.LeftType == "ivtCurrentDate" {
					w.line("cond.LeftVal(ID_ERROR);")
				} else {
					w.line("cond.LeftVal(%s);", w.datapointRef(c.Channel, c.Datapoint, c.LeftValue))
				}
				if c.Channel > 0 {
					w.line("cond.ConditionChannel(%d);", c.Channel)
				}
				w.line("cond.ConditionType(%d);", c.Compare)
				w.line("cond.ConditionType2(%d);", c.Trigger)
				if c.Time != nil {
					w.timeModule(c.Time)
				} else {
					w.line("cond.RightVal1ValType(%s);", w.constant(c.Value1Type))
					w.line("cond.RightVal1(%s);", w.literal(c.Value1Type, c.Value1))
				}
				w.line("cond.RightVal2ValType(%s);", w.constant(c.Value2Type))
				w.line("cond.RightVal2(%s);", w.literal(c.Value2Type, c.Value2))
			}
		}
		w.branch(r.ProgramBranch)
	}
	if p.Else != nil {
		w.line("rule = rule.RuleCreateSubRule();")
		w.line("rule.ElseIfFlag(false);")
		w.branch(*p.Else)
	}
	return w.b.String(), strings.Join(w.checks, "\n"), w.err
}

// ErrProgramReferences: the program uses a datapoint or time module that no
// longer exists; nothing was changed.
var ErrProgramReferences = errors.New("the program uses a datapoint or time module that doesn't exist")

// SaveProgram writes a program (a new one if its ID is 0) and returns
// SetOK with its id, or SetNotFound.
func (c *Client) SaveProgram(p ProgramDefinition) (result string, id int64, err error) {
	if err := validateName(p.Name); err != nil {
		return "", 0, err
	}
	if strings.Contains(p.Description, "^") || len(p.Description) > 1000 {
		return "", 0, fmt.Errorf("invalid description")
	}
	code, checks, err := programCode(p)
	if err != nil {
		return "", 0, err
	}
	data, err := json.Marshal(p)
	if err != nil {
		return "", 0, err
	}
	// In one pass: a placeholder inside a script or name stays as it is
	script := strings.NewReplacer(
		"{{DATA}}", string(data),
		"{{CODE}}", strings.TrimRight(code, "\n"),
		"{{CHECKS}}", checks,
		"{{ID}}", strconv.FormatInt(p.ID, 10),
		"{{NAME}}", p.Name,
		"{{DESCRIPTION}}", p.Description,
		"{{ACTIVE}}", strconv.FormatBool(p.Active),
	).Replace(saveProgramScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", 0, err
	}
	if strings.TrimSpace(output) == "MISSING" {
		return "", 0, ErrProgramReferences
	}
	result, value, err := resultWithValue(output)
	if err != nil || result != SetOK {
		return result, 0, err
	}
	return result, atoi64(value), nil
}

// DeleteProgram deletes a program and returns SetOK with its name, or
// SetNotFound (also for programs that can't be deleted).
func (c *Client) DeleteProgram(id int64) (result, name string, err error) {
	output, err := c.Execute(strings.ReplaceAll(deleteProgramScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}

// ProgramUsage is a program that uses channels of a device.
type ProgramUsage struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// The device's channels it uses
	Channels []string `json:"channels"`
}

// GetDevicePrograms returns the programs using a channel of the device
// (get_device_programs.tcl), in the order found.
func (c *Client) GetDevicePrograms(address string) ([]ProgramUsage, error) {
	if !safeIdentifierRegex.MatchString(address) {
		return nil, fmt.Errorf("invalid address")
	}
	output, err := c.Execute(strings.ReplaceAll(getDeviceProgramsScript, "{{ADDRESS}}", address))
	if err != nil {
		return nil, err
	}
	return parseProgramUsages(output), nil
}

func parseProgramUsages(output string) []ProgramUsage {
	usages := []ProgramUsage{}
	index := map[int64]int{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(strings.TrimRight(line, "\r"), "\t")
		if len(fields) < 4 || fields[0] != "P" {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		i, seen := index[id]
		if !seen {
			i = len(usages)
			index[id] = i
			usages = append(usages, ProgramUsage{ID: id, Name: fields[2], Channels: []string{}})
		}
		if !slices.Contains(usages[i].Channels, fields[3]) {
			usages[i].Channels = append(usages[i].Channels, fields[3])
		}
	}
	return usages
}
