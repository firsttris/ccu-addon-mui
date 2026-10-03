! Adds a channel to a room or trade (ACTION Add) or removes it (Remove).
! Writes OK or NOT_FOUND.
object groupObject = dom.GetObject({{GROUP_ID}});
object channelObject = dom.GetObject({{CHANNEL_ID}});
if (groupObject && channelObject) {
    groupObject.{{ACTION}}({{CHANNEL_ID}});
    Write("OK");
} else {
    Write("NOT_FOUND");
}
