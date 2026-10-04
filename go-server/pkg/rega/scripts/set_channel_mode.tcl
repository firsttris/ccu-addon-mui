! Stores what an input channel is wired to (0 off, 1 key, 2 switch,
! 3 contact, 4 level, 5 condition) as ReGa metadata "channelMode", as the WebUI does after saving
! CHANNEL_OPERATION_MODE (webui.js, Interface.setMetadata; stored as a
! string like api/methods/interface/setmetadata.tcl does). Writes OK or
! NOT_FOUND.
string channelId;
boolean found = false;
foreach (channelId, dom.GetObject(ID_CHANNELS).EnumUsedIDs()) {
    object channelObject = dom.GetObject(channelId);
    if (!found && (channelObject.Address() == "{{ADDRESS}}")) {
        object interfaceObject = dom.GetObject(channelObject.Interface());
        if (interfaceObject.Name() == "{{INTERFACE}}") {
            found = true;
            channelObject.RemoveMetaData("channelMode");
            channelObject.AddMetaData("channelMode", "{{MODE}}");
        }
    }
}
if (found) {
    Write("OK");
} else {
    Write("NOT_FOUND");
}
