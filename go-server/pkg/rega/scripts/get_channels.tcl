! Writes one line per channel and per datapoint, tab separated:
!   C <id> <address> <type> <interfaceName> <name>
!   S <statusChannelAddress> <type> <value>   battery/reachability of the device
!   D <type> <valueType> <value>
!   M <roomIds> <tradeIds>                   comma separated
! The JSON is built in Go, so names and values need no escaping here.
! OBJECT_ID is a room, trade or favorite list id, or ALL for the channels of
! all devices.
string objectId = "{{OBJECT_ID}}";
string channelId;
string datapointId;
boolean allChannels = (objectId == "ALL");

object parentObject = dom.GetObject(objectId);
if (allChannels) {
    parentObject = dom.GetObject(ID_CHANNELS);
}
if (parentObject) {
    foreach (channelId, parentObject.EnumUsedIDs()) {
        object channelObject = dom.GetObject(channelId);
        ! Favorite lists also hold system variables and programs
        if (channelObject.IsTypeOf(OT_CHANNEL)) {
            object interfaceObject = dom.GetObject(channelObject.Interface());
            object deviceObject = dom.GetObject(channelObject.Device());

            ! For all devices, skip the maintenance channels (their status is
            ! written as S lines) and the virtual remote keys of the CCU itself.
            boolean skip = false;
            if (allChannels) {
                if (channelObject.ChnNumber() == 0) {
                    skip = true;
                }
                if (deviceObject) {
                    if ((deviceObject.HssType() == "HM-RCV-50") || (deviceObject.HssType() == "HmIP-RCV-50")) {
                        skip = true;
                    }
                }
            }

            if (!skip) {
                WriteLine("C\t" # channelId # "\t" # channelObject.Address() # "\t" # channelObject.HssType() # "\t" # interfaceObject.Name() # "\t" # channelObject.Name());

                ! Rooms and trades of the channel, for the setup area
                string memberIds = "";
                string groupId;
                foreach (groupId, channelObject.ChnRoom()) {
                    if (memberIds != "") { memberIds = memberIds # ","; }
                    memberIds = memberIds # groupId;
                }
                string tradeIds = "";
                foreach (groupId, channelObject.ChnFunction()) {
                    if (tradeIds != "") { tradeIds = tradeIds # ","; }
                    tradeIds = tradeIds # groupId;
                }
                WriteLine("M\t" # memberIds # "\t" # tradeIds);

                ! Battery and reachability are reported on the device's maintenance channel 0
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
    }
}
