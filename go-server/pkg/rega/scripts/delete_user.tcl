! Deletes a CCU user with its favorite list, as the WebUI's
! system.fn::deleteUser does; not the Admin or an unerasable user. Writes
! OK, a tab and the name, or NOT_FOUND.
object user = dom.GetObject({{ID}});
boolean done = false;
if (user) {
    if ((user.Type() == OT_USER) && (!user.Unerasable()) && (user.Name() != "Admin")) {
        string name = user.Name();
        object favorites = dom.GetObject(ID_FAVORITES);
        if (favorites) {
            favorites.Remove(user.UserFavorite());
        }
        dom.DeleteObject(user.UserFavorite());
        object users = dom.GetObject(ID_USERS);
        if (users) {
            users.Remove(user.ID());
        }
        dom.DeleteObject(user.ID());
        done = true;
        Write("OK\t" # name);
    }
}
if (!done) {
    Write("NOT_FOUND");
}
