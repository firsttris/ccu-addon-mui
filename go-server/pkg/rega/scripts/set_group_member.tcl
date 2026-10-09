! Adds a channel to a room or trade (ACTION Add) or removes it (Remove).
! Writes OK or NOT_FOUND. Only lists (rooms, trades) and channels: Add on
! a program or device would change ReGa's objects.
object groupObject = dom.GetObject({{GROUP_ID}});
object channelObject = dom.GetObject({{CHANNEL_ID}});
boolean found = false;
if (groupObject && channelObject) {
    if (groupObject.IsTypeOf(OT_ENUM) && channelObject.IsTypeOf(OT_CHANNEL)) {
        found = true;
        groupObject.{{ACTION}}({{CHANNEL_ID}});
        Write("OK");
    }
}
if (!found) {
    Write("NOT_FOUND");
}
