! Lists the CCU users as the WebUI's user administration does
! (pages/tabs/admin/userAdministration.htm): a line per user with U, id,
! name, first name, last name, level (1 guest, 2 user, 8 admin), whether a
! password is set, whether it is shown on the login page, whether it may
! be deleted, mail and phone, tab-separated.
object users = dom.GetObject(ID_USERS);
string id;
foreach (id, users.EnumEnabledVisibleIDs()) {
    object user = dom.GetObject(id);
    if (user) {
        boolean hasPassword = (user.UserPwd() != "");
        boolean deletable = (!user.Unerasable()) && (user.Name() != "Admin");
        Write("U\t" # user.ID() # "\t" # user.Name() # "\t" # user.UserFirstName() # "\t" # user.UserLastName());
        Write("\t" # user.UserLevel() # "\t" # hasPassword # "\t" # user.UserShowLogin() # "\t" # deletable);
        Write("\t" # user.UserMailAddress() # "\t" # user.UserPhoneNumber() # "\n");
    }
}
