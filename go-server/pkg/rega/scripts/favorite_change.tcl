! Changes the favorite lists as the WebUI's favorites.fn does. ACTION is
!   create  a list NAME for USERNAME (all users if empty), like NewFavoriteList
!   rename  list LIST_ID to NAME
!   delete  list LIST_ID, like RemoveList
!   add     ITEM_ID (channel, system variable or program) to LIST_ID, like AddToList
!   remove  ITEM_ID from LIST_ID, like RemoveFromList
! Writes OK, a tab and the new list's id (create) or the list's previous
! name, or NOT_FOUND.
string action = "{{ACTION}}";
string userName = "{{USERNAME}}";
object favorites = dom.GetObject(ID_FAVORITES);
if (action == "create") {
    object newList = dom.CreateObject(OT_FAVORITE);
    if (favorites && newList) {
        newList.Name("{{NAME}}");
        favorites.Add(newList.ID());
        ! Shown in the WebUI on the PC (202), as NewFavoriteList does
        object pc = dom.GetObject(202);
        if (pc) { pc.Add(newList.ID()); }
        string userId;
        foreach (userId, dom.GetObject(ID_USERS).EnumEnabledVisibleIDs()) {
            object user = dom.GetObject(userId);
            if (user) {
                if ((userName == "") || (user.Name() == userName)) {
                    object userLists = favorites.Get("_USER" # userId);
                    if (!userLists) {
                        userLists = dom.CreateObject(OT_FAVORITE, "_USER" # userId);
                        favorites.Add(userLists.ID());
                    }
                    userLists.Add(newList.ID());
                }
            }
        }
        Write("OK\t" # newList.ID());
    } else {
        Write("NOT_FOUND");
    }
} else {
    object list = dom.GetObject({{LIST_ID}});
    boolean isList = false;
    if (list && favorites) {
        if ((list.Type() == OT_FAVORITE) && (list.Name().Substr(0, 5) != "_USER")) {
            isList = true;
        }
    }
    if (!isList) {
        Write("NOT_FOUND");
    } else {
        string previous = list.Name();
        if (action == "rename") {
            list.Name("{{NAME}}");
            Write("OK\t" # previous);
        }
        if (action == "delete") {
            favorites.Remove(list.ID());
            if (!list.Unerasable()) {
                dom.DeleteObject(list.ID());
            }
            Write("OK\t" # previous);
        }
        if ((action == "add") || (action == "remove")) {
            object item = dom.GetObject({{ITEM_ID}});
            boolean usable = false;
            if (item) {
                if (item.IsTypeOf(OT_CHANNEL) || item.IsTypeOf(OT_DP) || item.IsTypeOf(OT_PROGRAM)) {
                    usable = true;
                }
            }
            if (!usable) {
                Write("NOT_FOUND");
            } else {
                if (action == "add") {
                    list.Add(item.ID());
                } else {
                    list.Remove(item.ID());
                }
                Write("OK\t" # previous);
            }
        }
    }
}
