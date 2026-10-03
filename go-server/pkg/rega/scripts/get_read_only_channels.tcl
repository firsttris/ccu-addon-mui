! Writes the addresses of the channels non-administrators may not operate
! (UserAccessRights(iulOtherThanAdmin) not iarFullAccess, see
! set_channel_option.tcl), one per line.
string channelId;
foreach (channelId, dom.GetObject(ID_CHANNELS).EnumUsedIDs()) {
    object channel = dom.GetObject(channelId);
    if (channel) {
        if (channel.UserAccessRights(iulOtherThanAdmin) != iarFullAccess) {
            WriteLine(channel.Address());
        }
    }
}
