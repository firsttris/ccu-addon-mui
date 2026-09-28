! Writes one line per channel and per datapoint, tab separated:
!   C <id> <address> <type> <interfaceName> <name>
!   S <statusChannelAddress> <type> <value>   battery/reachability of the device
!   D <type> <valueType> <value>
! The JSON is built in Go, so names and values need no escaping here.
string objectId = "{{OBJECT_ID}}";
string channelId;
string datapointId;

object parentObject = dom.GetObject(objectId);
if (parentObject) {
    foreach (channelId, parentObject.EnumUsedIDs()) {
        object channelObject = dom.GetObject(channelId);
        object interfaceObject = dom.GetObject(channelObject.Interface());
        WriteLine("C\t" # channelId # "\t" # channelObject.Address() # "\t" # channelObject.HssType() # "\t" # interfaceObject.Name() # "\t" # channelObject.Name());

        ! Battery and reachability are reported on the device's maintenance channel 0
        object deviceObject = dom.GetObject(channelObject.Device());
        if (deviceObject) {
            object statusChannel = dom.GetObject(deviceObject.Channels().GetAt(0));
            if (statusChannel) {
                foreach (datapointId, statusChannel.DPs().EnumUsedIDs()) {
                    object statusDatapoint = dom.GetObject(datapointId);
                    string statusType = statusDatapoint.HssType();
                    if ((statusType == "LOW_BAT") || (statusType == "LOWBAT") || (statusType == "UNREACH")) {
                        WriteLine("S\t" # statusChannel.Address() # "\t" # statusType # "\t" # statusDatapoint.Value());
                    }
                }
            }
        }

        foreach (datapointId, channelObject.DPs().EnumUsedIDs()) {
            object datapointObject = dom.GetObject(datapointId);
            WriteLine("D\t" # datapointObject.HssType() # "\t" # datapointObject.ValueType() # "\t" # datapointObject.Value());
        }
    }
}
