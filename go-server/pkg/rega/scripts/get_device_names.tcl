! Writes one line per device: <address> <name>, tab separated.
string deviceId;
foreach (deviceId, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object deviceObject = dom.GetObject(deviceId);
    WriteLine(deviceObject.Address() # "\t" # deviceObject.Name());
}
