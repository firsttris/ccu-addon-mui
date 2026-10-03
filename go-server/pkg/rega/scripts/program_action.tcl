! Runs a program (ACTION run) or switches it on or off (ACTION on/off).
! Writes OK or NOT_FOUND.
object prg = dom.GetObject({{ID}});
string action = "{{ACTION}}";
if (prg) {
    if (prg.IsTypeOf(OT_PROGRAM)) {
        if (action == "run") { prg.ProgramExecute(); }
        if (action == "on") { prg.Active(true); }
        if (action == "off") { prg.Active(false); }
        Write("OK");
    } else {
        Write("NOT_FOUND");
    }
} else {
    Write("NOT_FOUND");
}
