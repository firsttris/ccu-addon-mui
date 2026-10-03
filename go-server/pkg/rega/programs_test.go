package rega

import (
	"strings"
	"testing"
)

const programOutput = "K\tivtEmpty\t0\nK\tivtBinary\t2\nK\tivtFloat\t4\nK\tivtString\t20\nK\tivtObjectId\t9\n" +
	"K\tivtSystemId\t10\nK\tivtCurrentDate\t11\nK\tivtDelay\t12\nK\tivtSpecialValue\t13\n" +
	"P\t1201\ttrue\ttrue\tRollläden abends\n" +
	"I\tZeile 1%0AZeile 2\n" +
	"R\ttrue\tfalse\n" +
	"G\t2\n" +
	"S\t1\t9\t2001\t2000\tSTATE\t1\t4\t2\t2\t1\t0\n" +
	"S\t1\t11\t65535\t65535\t\t1\t13\t9\t2\t1500\t0\n" +
	"T\t1500\t9\t2007-01-01 19:30:00\t0\t0\t0\t127\t1\t2026-01-01 00:00:00\t0\t0\t\n" +
	"D\t9\t3000\t3001\tLEVEL\t4\t12\t1970-01-01 00:02:30\t0.000000\n" +
	"D\t20\t65535\t65535\t\t20\t0\t\twrite(\"a%09b\");%0Awrite(1);\n" +
	"R\tfalse\ttrue\n" +
	"D\t10\t65535\t950\t\t2\t0\t\ttrue\n"

func TestParseProgram(t *testing.T) {
	p, err := parseProgram(programOutput)
	if err != nil || p == nil {
		t.Fatalf("parseProgram: %v", err)
	}
	if p.ID != 1201 || !p.Active || p.Name != "Rollläden abends" || p.Description != "Zeile 1\nZeile 2" {
		t.Fatalf("program: %+v", p)
	}
	if len(p.Rules) != 1 || len(p.Rules[0].Groups) != 1 || len(p.Rules[0].Groups[0]) != 2 || p.Rules[0].GroupOperator != "or" {
		t.Fatalf("rules: %+v", p.Rules)
	}
	device, timed := p.Rules[0].Groups[0][0], p.Rules[0].Groups[0][1]
	if device.LeftType != "ivtObjectId" || device.LeftValue != 2001 || device.Channel != 2000 || device.Value1Type != "ivtBinary" || device.Value1 != "1" {
		t.Errorf("device condition: %+v", device)
	}
	if timed.LeftType != "ivtCurrentDate" || timed.Time == nil || timed.Time.ID != 1500 || timed.Time.Weekdays != 127 || timed.Time.Time != "2007-01-01 19:30:00" {
		t.Errorf("time condition: %+v %+v", timed, timed.Time)
	}
	dests := p.Rules[0].Destinations
	if len(dests) != 2 || dests[0].Delay != 150 || dests[0].Param != "ivtObjectId" || dests[1].Value != "write(\"a\tb\");\nwrite(1);" {
		t.Errorf("destinations: %+v", dests)
	}
	if p.Else == nil || !p.Else.BreakOnRestart || len(p.Else.Destinations) != 1 || p.Else.Destinations[0].ValueType != "ivtBinary" {
		t.Errorf("else: %+v", p.Else)
	}
	if missing, err := parseProgram("K\tivtEmpty\t0\nNOT_FOUND"); missing != nil || err != nil {
		t.Errorf("expected nil without an error for NOT_FOUND, got %v, %v", missing, err)
	}
}

func TestProgramCodeRoundTrip(t *testing.T) {
	p, _ := parseProgram(programOutput)
	code, err := programCode(*p)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"rule.ElseIfFlag(true);",
		"group.CndOperatorType(2);",
		"cond.OperatorType(1);",
		"cond.LeftValType(ivtObjectId);",
		`cond.LeftVal(dom.GetObject(2000).DPByHssDP("STATE").ID());`,
		`dest.DestinationDP(dom.GetObject(3000).DPByHssDP("LEVEL").ID());`,
		"dest.DestinationDP(950);",
		"cond.ConditionChannel(2000);",
		"cond.RightVal1ValType(ivtBinary);",
		// An unchanged time module is only referred to
		"cond.RightVal1(1500);",
		`dest.DestinationValueParam("00:02:30");`,
		"dest.DestinationValue(^write(\"a\tb\");\nwrite(1);^);",
		"rule = rule.RuleCreateSubRule();\n    rule.ElseIfFlag(false);",
		"rule.RuleDestination().BreakOnRestart(true);",
		"dest.DestinationValue(true);",
	} {
		if !strings.Contains(code, want) {
			t.Errorf("missing %q in\n%s", want, code)
		}
	}
	if strings.Contains(code, "tm.TimerType") {
		t.Error("unchanged time module written")
	}

	// A changed one is written in place
	p.Rules[0].Groups[0][1].Time.Changed = true
	code, _ = programCode(*p)
	if !strings.Contains(code, "tm = dom.GetObject(1500);") || !strings.Contains(code, `tm.Time("2007-01-01 19:30:00");`) {
		t.Errorf("time module not written:\n%s", code)
	}
}

func TestProgramCodeRefusesUnsafeValues(t *testing.T) {
	base := func() ProgramDefinition {
		return ProgramDefinition{Name: "P", Rules: []ProgramRule{{Groups: [][]ProgramCondition{}}}}
	}
	cases := []func(p *ProgramDefinition){
		func(p *ProgramDefinition) {
			p.Rules[0].Destinations = []ProgramDestination{{Param: "ivtString", ValueType: "ivtString", Value: "x^); system.Exec(^rm"}}
		},
		func(p *ProgramDefinition) {
			p.Rules[0].Destinations = []ProgramDestination{{Param: "ivtObjectId", ValueType: "ivtFloat", Value: "1); dom.DeleteObject(5"}}
		},
		func(p *ProgramDefinition) {
			p.Rules[0].Destinations = []ProgramDestination{{Param: "ivtObjectId); x(", ValueType: "ivtFloat", Value: "1"}}
		},
		func(p *ProgramDefinition) {
			p.Rules[0].Groups = [][]ProgramCondition{{{LeftType: "ivtCurrentDate", Value2Type: "ivtEmpty", Time: &TimeModule{Time: `"); x("`}}}}
		},
		func(p *ProgramDefinition) {
			p.Rules[0].Destinations = []ProgramDestination{{Param: "ivtObjectId", Channel: 5, Datapoint: `STATE").ID()); x(dom.GetObject("A`, ValueType: "ivtBinary", Value: "1"}}
		},
		func(p *ProgramDefinition) { p.Rules = nil },
	}
	for i, mutate := range cases {
		p := base()
		mutate(&p)
		if _, err := programCode(p); err == nil {
			t.Errorf("case %d: expected an error", i)
		}
	}
	c := &Client{}
	p := base()
	p.Name = `a"b`
	if _, _, err := c.SaveProgram(p); err == nil {
		t.Error("expected an error for a quote in the name")
	}
	p = base()
	p.Description = "a^b"
	if _, _, err := c.SaveProgram(p); err == nil {
		t.Error("expected an error for ^ in the description")
	}
}

func TestParseProgramUsages(t *testing.T) {
	usages := parseProgramUsages("P\t1201\tRollläden abends\tLEQ0000002:1\nP\t1300\tLicht\tLEQ0000002:1\nP\t1201\tRollläden abends\tLEQ0000002:2\nP\t1201\tRollläden abends\tLEQ0000002:2\n")
	if len(usages) != 2 || usages[0].ID != 1201 || len(usages[0].Channels) != 2 || usages[1].Name != "Licht" {
		t.Fatalf("got %+v", usages)
	}
}
