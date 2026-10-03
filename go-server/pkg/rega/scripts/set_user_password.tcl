! Sets the password of a CCU user, as the WebUI's system.fn::saveUserPwd
! does (UserBlankPwd). Writes OK, a tab and the name, or NOT_FOUND.
object user = dom.GetObject(ID_USERS).Get(^{{USERNAME}}^);
if (user) {
    user.UserBlankPwd(^{{PASSWORD}}^);
    Write("OK\t" # user.Name());
} else {
    Write("NOT_FOUND");
}
