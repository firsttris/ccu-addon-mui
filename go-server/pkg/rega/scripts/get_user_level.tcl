! Writes the user level of one CCU user: 1 = guest, 2 = user, 8 = admin.
! Writes nothing if there is no such user.
object userObject = dom.GetObject(ID_USERS).Get("{{USERNAME}}");
if (userObject) {
    Write(userObject.UserLevel());
}
