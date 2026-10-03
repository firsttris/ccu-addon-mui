! Sets one channel option as the WebUI's Channel.setVisibility,
! Channel.setUsability and Channel.setLogging do
! (api/methods/channel/set*.tcl), and the transmission mode as
! Channel.setMode (ChnAESActive): OPTION visible, usable, logged or aes. Writes
! OK, a tab and the channel name, or NOT_FOUND.
object channel = dom.GetObject({{ID}});
boolean found = false;
if (channel) {
    if (channel.IsTypeOf(OT_CHANNEL)) {
        found = true;
        string option = "{{OPTION}}";
        boolean value = {{VALUE}};
        if (option == "visible") {
            channel.Visible(value);
        }
        if (option == "usable") {
            var rights = iarRead;
            if (value) {
                rights = iarFullAccess;
            }
            channel.UserAccessRights(iulOtherThanAdmin, rights);
        }
        if (option == "logged") {
            channel.ChnArchive(value);
        }
        if (option == "aes") {
            channel.ChnAESActive(value);
        }
        Write("OK\t" # channel.Name());
    }
}
if (!found) {
    Write("NOT_FOUND");
}
