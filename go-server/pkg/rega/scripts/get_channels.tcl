! Writes one line per channel and per datapoint, tab separated:
!   C <id> <address> <type> <interfaceName> <name>
!   A <statusChannelAddress>                 the device's maintenance channel
!   S <statusChannelAddress> <type> <value>   battery/reachability of the device,
!                                            once per device (its first channel)
!   D <type> <valueType> <value>
!   M <roomIds> <tradeIds>                   comma separated
!   T <tile>                                 light or switch, if chosen in the add-on
!   F <visible> <usable> <logged> <aes>      the channel options of the WebUI
!   O <mode>                                 input channels: off, key, switch, contact ...
! The JSON is built in Go, so names and values need no escaping here.
! OBJECT_ID is a room, trade or favorite list id, or ALL for the channels of
! all devices.
string objectId = "{{OBJECT_ID}}";
string channelId;
string datapointId;
! Devices whose S lines were written, as "\t<id>\t<id>...\t"
string statusDevices = "\t";
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

            boolean skip = false;

            ! ReGa's own pseudo channels ("StateVariables" and "Communication"
            ! of the Gateway device) are of type channel with ChnNumber() -1,
            ! an empty address and no interface: even reading their channel
            ! number logs "invalid Address" in the CCU's log, and their
            ! missing interface stops the iteration with a ScriptRuntimeError.
            ! Skipped first, so nothing else is read from them.
            if (!interfaceObject) {
                skip = true;
            }

            ! For all devices, skip the maintenance channels (their status is
            ! written as S lines) and the virtual remote keys of the CCU itself.
            if (allChannels) {
                if (!skip) {
                    if (channelObject.ChnNumber() == 0) {
                        skip = true;
                    }
                    if (deviceObject) {
                        if ((deviceObject.HssType() == "HM-RCV-50") || (deviceObject.HssType() == "HmIP-RCV-50")) {
                            skip = true;
                        }
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

                ! The tile chosen in the add-on, see set_channel_tile.tcl
                if (channelObject.MetaData("muiTile") == "light") { WriteLine("T\tlight"); }
                if (channelObject.MetaData("muiTile") == "switch") { WriteLine("T\tswitch"); }

                ! What an input channel is wired to (0 off, 1 key, 2 switch,
                ! 3 contact, 4 level, 5 condition), stored by the WebUI as metadata "channelMode"
                ! (functions.fn); without it the channel is a key
                if (channelObject.HssType() == "MULTI_MODE_INPUT_TRANSMITTER") {
                    var channelMode = channelObject.MetaData("channelMode");
                    if (channelMode != null) { WriteLine("O\t" # channelMode); }
                }

                ! Visible, usable for non-administrators and logged, as the
                ! WebUI's Channel.setVisibility/setUsability/setLogging set them
                boolean usable = (channelObject.UserAccessRights(iulOtherThanAdmin) == iarFullAccess);
                WriteLine("F\t" # channelObject.Visible() # "\t" # usable # "\t" # channelObject.ChnArchive() # "\t" # channelObject.ChnAESActive());

                ! Battery and reachability are reported on the device's maintenance channel 0,
                ! the same for all its channels: read once per device
                if (deviceObject) {
                    object statusChannel = dom.GetObject(deviceObject.Channels().GetAt(0));
                    if (statusChannel) {
                        WriteLine("A\t" # statusChannel.Address());
                        string deviceKey = "\t" # deviceObject.ID() # "\t";
                        if (statusDevices.Find(deviceKey) < 0) {
                            statusDevices = statusDevices # deviceObject.ID() # "\t";
                            foreach (datapointId, statusChannel.DPs().EnumUsedIDs()) {
                                object statusDatapoint = dom.GetObject(datapointId);
                                string statusType = statusDatapoint.HssType();
                                if ((statusType == "LOW_BAT") || (statusType == "LOWBAT") || (statusType == "UNREACH")) {
                                    WriteLine("S\t" # statusChannel.Address() # "\t" # statusType # "\t" # statusDatapoint.Value());
                                }
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
