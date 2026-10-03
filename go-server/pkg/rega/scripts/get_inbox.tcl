! Writes one line per device in the inbox (paired, not yet accepted):
!   <address> <type> <interface> <name>, tab separated
string deviceId;
foreach (deviceId, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object deviceObject = dom.GetObject(deviceId);
    if (deviceObject.ReadyConfig() == false) {
        object interfaceObject = dom.GetObject(deviceObject.Interface());
        WriteLine(deviceObject.Address() # "\t" # deviceObject.HssType() # "\t" # interfaceObject.Name() # "\t" # deviceObject.Name());
    }
}
