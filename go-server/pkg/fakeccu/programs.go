package fakeccu

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/rega"
)

// Programs with rules, read and written like get_program.tcl and
// save_program.tcl do it in ReGa.

// Made-up values for the ReGa constants (get_program.tcl writes the real ones)
var regaConstants = map[string]int{
	"ivtEmpty": 0, "ivtNull": 1, "ivtBinary": 2, "ivtFloat": 4, "ivtInteger": 16, "ivtString": 20,
	"ivtObjectId": 9, "ivtSystemId": 10, "ivtSpecialValue": 13, "ivtCurrentDate": 11, "ivtDelay": 12,
}

func atoi64(s string) int64 {
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func constantValue(name string) string {
	if v, ok := regaConstants[name]; ok {
		return strconv.Itoa(v)
	}
	return strings.TrimPrefix(name, "N:")
}

// Like get_program.tcl: %-encoded where ReGa's Replace calls encode
func encodeText(s string) string {
	return strings.NewReplacer("%", "%25", "\t", "%09", "\r", "%0D", "\n", "%0A").Replace(s)
}

func writeBranch(b *strings.Builder, branch rega.ProgramBranch) {
	for _, d := range branch.Destinations {
		delayType, delay := "ivtEmpty", ""
		if d.Delay > 0 {
			delayType, delay = "ivtDelay", fmt.Sprintf("1970-01-01 %02d:%02d:%02d", d.Delay/3600, d.Delay/60%60, d.Delay%60)
		}
		fmt.Fprintf(b, "D\t%s\t%d\t%d\t%s\t%s\t%s\t%s\t%s\n", constantValue(d.Param), d.Channel, d.DatapointID, d.Datapoint,
			constantValue(d.ValueType), constantValue(delayType), delay, encodeText(d.Value))
	}
}

func (c *CCU) getProgram(id int64) string {
	var b strings.Builder
	for name, value := range regaConstants {
		fmt.Fprintf(&b, "K\t%s\t%d\n", name, value)
	}
	for _, p := range c.fixture.Programs {
		if p.ID != id {
			continue
		}
		fmt.Fprintf(&b, "P\t%d\t%t\t%t\t%s\n", p.ID, p.Active, p.Visible, p.Name)
		fmt.Fprintf(&b, "I\t%s\n", encodeText(p.Description))
		rules := p.Rules
		if len(rules) == 0 {
			// Every program has its WENN rule
			rules = []rega.ProgramRule{{}}
		}
		for _, r := range rules {
			fmt.Fprintf(&b, "R\ttrue\t%t\n", r.BreakOnRestart)
			groupOp, singleOp := 2, 1
			if r.GroupOperator == "and" {
				groupOp, singleOp = 1, 2
			}
			for _, group := range r.Groups {
				fmt.Fprintf(&b, "G\t%d\n", groupOp)
				for _, s := range group {
					value1Type, value1 := s.Value1Type, s.Value1
					if s.Time != nil {
						value1Type, value1 = "ivtObjectId", strconv.FormatInt(s.Time.ID, 10)
					}
					fmt.Fprintf(&b, "S\t%d\t%s\t%d\t%d\t%s\t%d\t%d\t%s\t%s\t%s\t%s\n", singleOp, constantValue(s.LeftType), s.LeftValue,
						s.Channel, s.Datapoint, s.Compare, s.Trigger, constantValue(value1Type), constantValue(s.Value2Type),
						encodeText(value1), encodeText(s.Value2))
					if t := s.Time; t != nil {
						fmt.Fprintf(&b, "T\t%d\t%d\t%s\t%d\t%d\t%d\t%d\t%d\t%s\t%s\t%d\t%s\n", t.ID, t.TimerType, t.Time, t.Duration,
							t.SunOffset, t.Period, t.Weekdays, t.RepetitionValue, t.Begin, t.End, t.RepetitionCount, t.RepeatTime)
					}
				}
			}
			writeBranch(&b, r.ProgramBranch)
		}
		if p.Else != nil {
			fmt.Fprintf(&b, "R\tfalse\t%t\n", p.Else.BreakOnRestart)
			writeBranch(&b, *p.Else)
		}
		return b.String()
	}
	return b.String() + "NOT_FOUND"
}

func (c *CCU) saveProgram(data string) string {
	var def rega.ProgramDefinition
	if err := json.Unmarshal([]byte(data), &def); err != nil {
		return "NOT_FOUND"
	}
	// New time modules get an id, changed ones are stored
	for i := range def.Rules {
		for _, group := range def.Rules[i].Groups {
			for j := range group {
				if t := group[j].Time; t != nil {
					if t.ID == 0 {
						t.ID = c.nextID()
						c.timeModules++
						t.ID += int64(c.timeModules)
					}
					t.Changed = false
				}
			}
		}
	}
	var program *Program
	if def.ID == 0 {
		c.fixture.Programs = append(c.fixture.Programs, Program{ID: c.nextID(), Visible: true})
		program = &c.fixture.Programs[len(c.fixture.Programs)-1]
	} else {
		for i := range c.fixture.Programs {
			if c.fixture.Programs[i].ID == def.ID {
				program = &c.fixture.Programs[i]
			}
		}
	}
	if program == nil {
		return "NOT_FOUND"
	}
	program.Name, program.Description, program.Active = def.Name, def.Description, def.Active
	program.Rules, program.Else = def.Rules, def.Else
	return fmt.Sprintf("OK\t%d", program.ID)
}
