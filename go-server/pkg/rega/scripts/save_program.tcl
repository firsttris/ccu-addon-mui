! Saves a program from the add-on's program editor the way the WebUI's
! editor does on "OK" (rega/esp/programs.fn, RestoreProgram): the rules are
! built on a new program object and copied onto the program with
! ProgramCopyTo, so it keeps its id; then ProgramUpdate(). A new program
! (ID 0) is created and built in place, like NewProgram.
! The program as JSON, a comment for the add-on's tests: {{DATA}}
! Writes OK, a tab and the program's id, or NOT_FOUND.
object programs = dom.GetObject(ID_PROGRAMS);
object target = dom.GetObject({{ID}});
if ({{ID}} == 0) {
    target = dom.CreateObject(OT_PROGRAM);
    programs.Add(target.ID());
}
boolean found = false;
if (target) {
    if (target.IsTypeOf(OT_PROGRAM)) {
        found = true;
    }
}
if (found) {
    object program = target;
    if ({{ID}} != 0) {
        program = dom.CreateObject(OT_PROGRAM);
    }
    object rule = program.Rule();
    object group = rule;
    object cond = rule;
    object dest = rule;
    object tm = rule;
{{CODE}}
    if ({{ID}} != 0) {
        program.ProgramCopyTo(target.ID());
        dom.DeleteObject(program.ID());
    }
    target.Name("{{NAME}}");
    target.PrgInfo(^{{DESCRIPTION}}^);
    target.Active({{ACTIVE}});
    target.ProgramUpdate();
    Write("OK\t" # target.ID());
} else {
    Write("NOT_FOUND");
}
