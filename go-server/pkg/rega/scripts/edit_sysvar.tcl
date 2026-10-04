! Changes the settings of a system variable as the WebUI's dialog does
! (rega/esp/system.fn::saveSysVar): description, unit, names of true and
! false, range, value list. Its kind and channel stay; the value stays
! too unless the new range or value list leaves it out.
! Writes OK or NOT_FOUND.
object sv = dom.GetObject({{ID}});
boolean found = false;
if (sv) {
    if (sv.IsTypeOf(OT_VARDP) || sv.IsTypeOf(OT_ALARMDP)) {
        found = true;
        integer st = sv.ValueSubType();
        sv.DPInfo(^{{INFO}}^);
        sv.ValueUnit("{{UNIT}}");
        ! Bool, alarm and presence (istPresent) are binary
        if (sv.ValueType() == ivtBinary) {
            sv.ValueName0("{{FALSE_NAME}}");
            sv.ValueName1("{{TRUE_NAME}}");
        }
        if (st == istGeneric) {
            sv.ValueMin({{MIN}});
            sv.ValueMax({{MAX}});
            if (sv.Value() < {{MIN}}) { sv.State({{MIN}}); }
            if (sv.Value() > {{MAX}}) { sv.State({{MAX}}); }
        }
        if (st == istEnum) {
            sv.ValueList("{{VALUE_LIST}}");
            sv.ValueMax({{MAX}});
            if (sv.Value() > {{MAX}}) { sv.State(0); }
        }
        dom.RTUpdate(false);
        Write("OK");
    }
}
if (!found) {
    Write("NOT_FOUND");
}
