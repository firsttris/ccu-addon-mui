! Changes the settings of a system variable as the WebUI's dialog does
! (rega/esp/system.fn::saveSysVar): description, unit, names of true and
! false, range, value list, channel (CHANNEL 0: none). Its kind stays;
! the value stays too unless the new range or value list leaves it out.
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
        ! The channel as saveSysVar moves it: out of the old channel's
        ! datapoints, into the new one's
        object oldChannel = dom.GetObject(sv.Channel());
        if (oldChannel) { oldChannel.DPs().Remove(sv.ID()); }
        boolean bound = false;
        if ({{CHANNEL}} != 0) {
            object newChannel = dom.GetObject({{CHANNEL}});
            if (newChannel) {
                if (newChannel.IsTypeOf(OT_CHANNEL)) {
                    newChannel.DPs().Add(sv.ID());
                    sv.Channel(newChannel.ID());
                    bound = true;
                }
            }
        }
        if (!bound) { sv.Channel(ID_ERROR); }
        dom.RTUpdate(false);
        Write("OK");
    }
}
if (!found) {
    Write("NOT_FOUND");
}
