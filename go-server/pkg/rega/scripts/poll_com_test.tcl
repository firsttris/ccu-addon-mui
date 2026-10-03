! Checks a device's function test, as the WebUI's Device.pollComTest does:
! writes OK, a tab and the time the device answered if that is not before
! SINCE (the start time), OK and a tab while it hasn't, or NOT_FOUND.
string address = "{{ADDRESS}}";
string targetId = "";
string id;
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    if (dom.GetObject(id).Address() == address) {
        targetId = id;
    }
}
if (targetId != "") {
    object device = dom.GetObject(targetId);
    var since = "{{SINCE}}";
    if (device.LastTestCompletedTime() >= since) {
        Write("OK\t" # device.LastTestCompletedTime());
    } else {
        Write("OK\t");
    }
} else {
    Write("NOT_FOUND");
}
