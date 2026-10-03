! Writes one program with its rules, as the WebUI's program editor reads
! them (rega/esp/rule.inc, sico.inc, dest.inc), tab separated. Texts that
! may hold tabs or line breaks are %-encoded (% \t \r \n).
!   K <name> <value>       numeric value of a ReGa constant used below
!   P <id> <active> <visible> <name>
!   I <description>
!   R <elseIf> <breakOnRestart>           a rule: WENN, SONST WENN or SONST
!   G <operator>                          a condition group (to the next one)
!   S <operator> <leftValType> <leftVal> <channel> <datapoint> <conditionType>
!     <conditionType2> <rv1Type> <rv2Type> <rv1> <rv2>
!   T <id> <timerType> <time> <duration> <sunOffset> <period> <weekdays>
!     <repetitionValue> <begin> <end> <repetitionCount> <repeatTime>
!   D <param> <channel> <dp> <datapoint> <valueType> <delayType> <delay> <value>
! <datapoint> is the datapoint's name (STATE, LEVEL, ...) for devices.
! Writes NOT_FOUND if there is no such program.
WriteLine("K\tivtEmpty\t" # ivtEmpty);
WriteLine("K\tivtNull\t" # ivtNull);
WriteLine("K\tivtBinary\t" # ivtBinary);
WriteLine("K\tivtFloat\t" # ivtFloat);
WriteLine("K\tivtInteger\t" # ivtInteger);
WriteLine("K\tivtString\t" # ivtString);
WriteLine("K\tivtObjectId\t" # ivtObjectId);
WriteLine("K\tivtSystemId\t" # ivtSystemId);
WriteLine("K\tivtSpecialValue\t" # ivtSpecialValue);
WriteLine("K\tivtCurrentDate\t" # ivtCurrentDate);
WriteLine("K\tivtDelay\t" # ivtDelay);
object program = dom.GetObject({{ID}});
boolean found = false;
if (program) {
    if (program.IsTypeOf(OT_PROGRAM)) {
        found = true;
        string text;
        text = program.PrgInfo().ToString();
        text = text.Replace("%", "%25");
        text = text.Replace("\t", "%09");
        text = text.Replace("\r", "%0D");
        text = text.Replace("\n", "%0A");
        WriteLine("P\t" # program.ID() # "\t" # program.Active() # "\t" # program.Visible() # "\t" # program.Name());
        WriteLine("I\t" # text);
        object rule = program.Rule();
        integer ruleCount = 0;
        while (rule && (ruleCount < 50)) {
            ruleCount = ruleCount + 1;
            object destination = rule.RuleDestination();
            WriteLine("R\t" # rule.ElseIfFlag() # "\t" # destination.BreakOnRestart());
            if (rule.ElseIfFlag()) {
                integer groupCount = rule.RuleConditions().Count();
                if (groupCount > 0) {
                    string gi;
                    foreach (gi, system.GenerateEnum(0, groupCount - 1)) {
                        object group = rule.RuleCondition(gi.ToInteger());
                        WriteLine("G\t" # group.CndOperatorType());
                        integer singleCount = group.CndSingleCount();
                        if (singleCount > 0) {
                            string si;
                            foreach (si, system.GenerateEnum(0, singleCount - 1)) {
                                object cond = group.CndSingleCondition(si.ToInteger());
                                string rv1;
                                rv1 = cond.RightVal1().ToString();
                                rv1 = rv1.Replace("%", "%25");
                                rv1 = rv1.Replace("\t", "%09");
                                rv1 = rv1.Replace("\r", "%0D");
                                rv1 = rv1.Replace("\n", "%0A");
                                string rv2;
                                rv2 = cond.RightVal2().ToString();
                                rv2 = rv2.Replace("%", "%25");
                                rv2 = rv2.Replace("\t", "%09");
                                rv2 = rv2.Replace("\r", "%0D");
                                rv2 = rv2.Replace("\n", "%0A");
                                string dpName = "";
                                if (cond.LeftValType() == ivtObjectId) {
                                    object leftDp = dom.GetObject(cond.LeftVal());
                                    if (leftDp) { dpName = leftDp.HssType(); }
                                }
                                WriteLine("S\t" # cond.OperatorType() # "\t" # cond.LeftValType() # "\t" # cond.LeftVal() # "\t" # cond.ConditionChannel() # "\t" # dpName # "\t" # cond.ConditionType() # "\t" # cond.ConditionType2() # "\t" # cond.RightVal1ValType() # "\t" # cond.RightVal2ValType() # "\t" # rv1 # "\t" # rv2);
                                if ((cond.LeftValType() == ivtCurrentDate) && (cond.RightVal1ValType() == ivtObjectId)) {
                                    object tm = dom.GetObject(cond.RightVal1());
                                    if (tm) {
                                        WriteLine("T\t" # tm.ID() # "\t" # tm.TimerType() # "\t" # tm.Time() # "\t" # tm.CalDuration() # "\t" # tm.SunOffsetType() # "\t" # tm.Period() # "\t" # tm.Weekdays() # "\t" # tm.CalRepetitionValue() # "\t" # tm.Begin() # "\t" # tm.End() # "\t" # tm.CalRepetitionCount() # "\t" # tm.CalRepeatTime());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            integer destCount = destination.DestSingleCount();
            if (destCount > 0) {
                string di;
                foreach (di, system.GenerateEnum(0, destCount - 1)) {
                    object dest = destination.DestSingleDestination(di.ToInteger());
                    string value;
                    value = dest.DestinationValue().ToString();
                    value = value.Replace("%", "%25");
                    value = value.Replace("\t", "%09");
                    value = value.Replace("\r", "%0D");
                    value = value.Replace("\n", "%0A");
                    string destDpName = "";
                    if (dest.DestinationParam() == ivtObjectId) {
                        object destDp = dom.GetObject(dest.DestinationDP());
                        if (destDp) { destDpName = destDp.HssType(); }
                    }
                    WriteLine("D\t" # dest.DestinationParam() # "\t" # dest.DestinationChannel() # "\t" # dest.DestinationDP() # "\t" # destDpName # "\t" # dest.DestinationValueType() # "\t" # dest.DestinationValueParamType() # "\t" # dest.DestinationValueParam().ToString() # "\t" # value);
                }
            }
            rule = rule.RuleSubRule();
        }
    }
}
if (!found) {
    Write("NOT_FOUND");
}
