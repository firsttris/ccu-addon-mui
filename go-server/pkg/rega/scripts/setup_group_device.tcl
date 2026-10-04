! After saving a heating group, what the WebUI's GroupEditPage.ftl does in
! ReGa: names the group's virtual device "<NAME>" and its channels
! "<NAME>:<channel>" (refreshDeviceFromHomematic, adaptChannelNames; only
! with RENAME 1), takes it out of the inbox, and sets the metadata
! inHeatingGroup of the members' devices (Interface.setMetadata) to true
! and of the devices no longer in the group to false, which may be operated
! alone again (GroupListPage.ftl: Device.setOperateGroupOnly false). MEMBERS and OTHERS
! are device addresses separated by tabs (foreach goes through them).
! Writes OK, or NOT_FOUND while the
! virtual device is not there yet.
string address = "{{ADDRESS}}";
string name = "{{NAME}}";
boolean rename = ({{RENAME}} == 1);
string members = "{{MEMBERS}}";
string others = "{{OTHERS}}";
string id;
string channelId;
string result = "NOT_FOUND";
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object dev = dom.GetObject(id);
    string devAddress = dev.Address();
    if (devAddress == address) {
        if (rename) {
            dev.Name(name);
        }
        foreach (channelId, dev.Channels().EnumUsedIDs()) {
            object ch = dom.GetObject(channelId);
            if (rename) {
                ch.Name(name # ":" # ch.Address().StrValueByIndex(":", 1));
            }
            ch.ReadyConfig(true);
        }
        dev.ReadyConfig(true);
        result = "OK";
    }
    string member;
    foreach (member, members) {
        if ((member != "") && (member == devAddress)) {
            dev.RemoveMetaData("inHeatingGroup");
            dev.AddMetaData("inHeatingGroup", "true");
        }
    }
    foreach (member, others) {
        if ((member != "") && (member == devAddress)) {
            dev.RemoveMetaData("inHeatingGroup");
            dev.AddMetaData("inHeatingGroup", "false");
            dev.MetaData("operateGroupOnly", false);
        }
    }
}
if (result == "OK") {
    dom.RTUpdate(false);
}
Write(result);
