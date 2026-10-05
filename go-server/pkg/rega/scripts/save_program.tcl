! Saves a program from the add-on's program editor the way the WebUI's
! editor does on "OK" (rega/esp/programs.fn, RestoreProgram): the rules are
! built on a new program object and copied onto the program with
! ProgramCopyTo, so it keeps its id; then ProgramUpdate(). A new program
! (ID 0) is built the same way and added to the programs only at the end.
! First every datapoint and time module the rules use is looked up: a
! missing one would abort the script halfway (null.ID()) and leave a
! half-built program behind.
! The program as JSON, a comment for the add-on's tests: {{DATA}}
! Writes OK, a tab and the program's id, NOT_FOUND, or MISSING (a datapoint
! or time module doesn't exist; nothing changed).
object programs = dom.GetObject(ID_PROGRAMS);
object target = dom.GetObject({{ID}});
boolean found = false;
if ({{ID}} == 0) {
    found = true;
} else {
    if (target) {
        if (target.IsTypeOf(OT_PROGRAM)) {
            found = true;
        }
    }
}
boolean valid = true;
object chk = programs;
object chkDP = programs;
{{CHECKS}}
if (found && valid) {
    object program = dom.CreateObject(OT_PROGRAM);
    object rule = program.Rule();
    object group = rule;
    object cond = rule;
    object dest = rule;
    object tm = rule;
{{CODE}}
    if ({{ID}} != 0) {
        program.ProgramCopyTo(target.ID());
        dom.DeleteObject(program.ID());
    } else {
        programs.Add(program.ID());
        target = program;
    }
    target.Name("{{NAME}}");
    target.PrgInfo(^{{DESCRIPTION}}^);
    target.Active({{ACTIVE}});
    target.ProgramUpdate();
    Write("OK\t" # target.ID());
} else {
    if (found) {
        Write("MISSING");
    } else {
        Write("NOT_FOUND");
    }
}
