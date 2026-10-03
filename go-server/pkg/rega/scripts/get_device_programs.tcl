! Writes the programs that use a channel of a device, as the WebUI's
! Channel.listProgramIds finds them (api/methods/channel/listprogramids.tcl:
! ChnEnumDPUsagePrograms): one line "P <program id> <program name> <channel
! address>" per program and channel.
string address = "{{ADDRESS}}";
string id;
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object device = dom.GetObject(id);
    if (device.Address() == address) {
        string channelId;
        foreach (channelId, device.Channels().EnumUsedIDs()) {
            object channel = dom.GetObject(channelId);
            if (channel) {
                string programId;
                foreach (programId, channel.ChnEnumDPUsagePrograms()) {
                    object program = dom.GetObject(programId);
                    if (program) {
                        WriteLine("P\t" # programId # "\t" # program.Name() # "\t" # channel.Address());
                    }
                }
            }
        }
    }
}
