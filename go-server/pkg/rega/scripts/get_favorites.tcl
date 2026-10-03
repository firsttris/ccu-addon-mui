! Writes the favorite lists a CCU user sees, as the WebUI's favorites.htm
! lists them (the lists the user's "_USER<id>" object holds, without the
! copies being edited). All lists if USERNAME is empty. Tab separated:
!   L <id> <name>
!   I <id> <type>   CHANNEL, SYSVAR, PROGRAM or SEPARATOR, in list order
string userName = "{{USERNAME}}";
object favorites = dom.GetObject(ID_FAVORITES);
string listIds = "";
if (favorites) {
    if (userName == "") {
        listIds = favorites.EnumUsedIDs();
    } else {
        object user = dom.GetObject(ID_USERS).Get(userName);
        if (user) {
            object userLists = favorites.Get("_USER" # user.ID());
            if (userLists) {
                listIds = userLists.EnumEnabledVisibleIDs();
            }
        }
    }
}
string listId;
foreach (listId, listIds) {
    object list = dom.GetObject(listId);
    if (list) {
        if ((list.Name().Substr(0, 5) != "_USER") && (list.EnCopyID() == ID_ERROR)) {
            WriteLine("L\t" # listId # "\t" # list.Name());
            string itemId;
            foreach (itemId, list.EnumUsedIDs()) {
                object item = dom.GetObject(itemId);
                if (item) {
                    string itemType = "SEPARATOR";
                    if (item.IsTypeOf(OT_PROGRAM)) { itemType = "PROGRAM"; }
                    if (item.IsTypeOf(OT_DP)) { itemType = "SYSVAR"; }
                    if (item.IsTypeOf(OT_CHANNEL)) { itemType = "CHANNEL"; }
                    WriteLine("I\t" # itemId # "\t" # itemType);
                }
            }
        }
    }
}
