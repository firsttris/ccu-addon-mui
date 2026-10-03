! Accepts a device from the inbox: marks it and its channels as configured,
! as the WebUI does. Writes OK or NOT_FOUND.
string address = "{{ADDRESS}}";
string deviceId;
string channelId;
string result = "NOT_FOUND";
foreach (deviceId, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object deviceObject = dom.GetObject(deviceId);
    if (deviceObject.Address() == address) {
        foreach (channelId, deviceObject.Channels().EnumUsedIDs()) {
            dom.GetObject(channelId).ReadyConfig(true);
        }
        deviceObject.ReadyConfig(true);
        result = "OK";
    }
}
Write(result);
