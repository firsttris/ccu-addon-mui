! Deletes a program as the WebUI does (rega/esp/programs.fn, DeleteProgram):
! not if it is unerasable. Writes OK, a tab and its name, or NOT_FOUND.
object program = dom.GetObject({{ID}});
boolean found = false;
if (program) {
    if (program.IsTypeOf(OT_PROGRAM)) {
        if (!program.Unerasable()) {
            found = true;
            string name = program.Name();
            dom.DeleteObject(program.ID());
            Write("OK\t" # name);
        }
    }
}
if (!found) {
    Write("NOT_FOUND");
}
