! Writes the tile layout the add-on stored on a room, trade or favorite
! list (ReGa metadata "muiLayout", see set_layout.tcl): OK, a tab and the
! layout (JSON, empty if none), or NOT_FOUND.
object view = dom.GetObject({{ID}});
boolean found = false;
if (view) {
    if (view.IsTypeOf(OT_ENUM) || (view.Type() == OT_FAVORITE)) {
        found = true;
        string layout = "";
        if (view.MetaData("muiLayout") != "") {
            layout = view.MetaData("muiLayout");
        }
        Write("OK\t" # layout);
    }
}
if (!found) {
    Write("NOT_FOUND");
}
