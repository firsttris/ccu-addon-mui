! Creates a system variable. Value types as ReGa numbers them: 2/2 bool,
! 2/6 alarm, 4/0 number, 16/29 enum, 20/11 string. Writes OK, a tab and
! the new variable's id, or NOT_FOUND.
object list = dom.GetObject(ID_SYSTEM_VARIABLES);
object sv = dom.CreateObject({{OBJECT_TYPE}});
if (list && sv) {
    list.Add(sv.ID());
    sv.Name("{{NAME}}");
    sv.ValueType({{VALUE_TYPE}});
    sv.ValueSubType({{SUB_TYPE}});
    sv.DPInfo("");
    sv.ValueUnit("{{UNIT}}");
    sv.ValueMin({{MIN}});
    sv.ValueMax({{MAX}});
    sv.ValueName0("{{FALSE_NAME}}");
    sv.ValueName1("{{TRUE_NAME}}");
    sv.ValueList("{{VALUE_LIST}}");
    sv.State({{INITIAL}});
    sv.Internal(false);
    sv.Visible(true);
    ! An alarm only raises alarms as a system alarm with a condition,
    ! like the WebUI creates it
    if (sv.IsTypeOf(OT_ALARMDP)) {
        sv.AlType(atSystem);
        sv.AlArm(true);
        sv.AlSetBinaryCondition();
    }
    dom.RTUpdate(false);
    Write("OK\t" # sv.ID());
} else {
    Write("NOT_FOUND");
}
