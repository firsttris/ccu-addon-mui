! Writes the virtual keys of the CCU itself (the channels of its HM-RCV-50
! and HmIP-RCV-50 devices, which get_channels.tcl leaves out), as the
! WebUI's device list shows them: one line
!   K <id> <address> <interface> <programs> <name>
! programs is how many programs use the key (ChnEnumDPUsagePrograms, as in
! api/methods/channel/listprogramids.tcl).
string id;
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object device = dom.GetObject(id);
    if ((device.HssType() == "HM-RCV-50") || (device.HssType() == "HmIP-RCV-50")) {
        object interfaceObject = dom.GetObject(device.Interface());
        string channelId;
        foreach (channelId, device.Channels().EnumUsedIDs()) {
            object channel = dom.GetObject(channelId);
            if (channel.ChnNumber() > 0) {
                integer programs = 0;
                string programId;
                foreach (programId, channel.ChnEnumDPUsagePrograms()) {
                    programs = programs + 1;
                }
                WriteLine("K\t" # channelId # "\t" # channel.Address() # "\t" # interfaceObject.Name() # "\t" # programs # "\t" # channel.Name());
            }
        }
    }
}
