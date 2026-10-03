! Stores the tile chosen in the add-on for a channel (light or switch) as
! ReGa metadata, as the WebUI's Interface.setMetadata does; an empty TILE
! removes it. Writes OK, a tab and the channel's name, or NOT_FOUND.
object channelObject = dom.GetObject({{ID}});
boolean found = false;
if (channelObject) {
    if (channelObject.IsTypeOf(OT_CHANNEL)) {
        found = true;
        channelObject.RemoveMetaData("muiTile");
        if ("{{TILE}}" != "") {
            channelObject.AddMetaData("muiTile", "{{TILE}}");
        }
        Write("OK\t" # channelObject.Name());
    }
}
if (!found) {
    Write("NOT_FOUND");
}
