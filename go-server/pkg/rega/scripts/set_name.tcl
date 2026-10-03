! Renames the device or channel with the given address. Writes OK, a tab
! and the previous name, or NOT_FOUND.
string address = "{{ADDRESS}}";
string targetId = "";
string id;
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    if (dom.GetObject(id).Address() == address) {
        targetId = id;
    }
}
if (targetId == "") {
    foreach (id, dom.GetObject(ID_CHANNELS).EnumUsedIDs()) {
        if (dom.GetObject(id).Address() == address) {
            targetId = id;
        }
    }
}
if (targetId != "") {
    object target = dom.GetObject(targetId);
    string previousName = target.Name();
    target.Name("{{NAME}}");
    Write("OK\t" # previousName);
} else {
    Write("NOT_FOUND");
}
