! Stores the tile layout of a room, trade or favorite list as ReGa metadata,
! as the WebUI's Interface.setMetadata stores metadata (RemoveMetaData,
! AddMetaData); an empty LAYOUT removes it. Writes OK, a tab and the name,
! or NOT_FOUND.
object view = dom.GetObject({{ID}});
boolean found = false;
if (view) {
    if (view.IsTypeOf(OT_ENUM) || (view.Type() == OT_FAVORITE)) {
        found = true;
        view.RemoveMetaData("muiLayout");
        string layout = ^{{LAYOUT}}^;
        if (layout != "") {
            view.AddMetaData("muiLayout", layout);
        }
        Write("OK\t" # view.Name());
    }
}
if (!found) {
    Write("NOT_FOUND");
}
