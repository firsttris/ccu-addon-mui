! Creates (ID 0) or changes a CCU user as the WebUI's system.fn::saveUser
! does, with its user favorite list for a new one. The password is set
! (UserBlankPwd) for a new user, or when SET_PASSWORD is true. AUTO_LOGIN
! makes it the user logged in automatically (system.fn::setAutoLogin), false
! takes that from it. Writes OK, a
! tab and the user id; EXISTS if another user has the name; NOT_FOUND.
object users = dom.GetObject(ID_USERS);
object other = users.Get(^{{NAME}}^);
boolean taken = false;
if (other) {
    if (other.ID() != {{ID}}) {
        taken = true;
    }
}
if (taken) {
    Write("EXISTS");
} else {
    integer userId = 0;
    if ({{ID}} == 0) {
        object created = users.UsersAdd();
        if (created) {
            created.UserBlankPwd(^{{PASSWORD}}^);
            userId = created.ID();
        }
    } else {
        object target = dom.GetObject({{ID}});
        if (target) {
            if (target.Type() == OT_USER) {
                userId = target.ID();
                if ({{SET_PASSWORD}}) {
                    target.UserBlankPwd(^{{PASSWORD}}^);
                }
            }
        }
    }
    if (userId != 0) {
        object user = dom.GetObject(userId);
        user.Name(^{{NAME}}^);
        user.UserFirstName(^{{FIRST_NAME}}^);
        user.UserLastName(^{{LAST_NAME}}^);
        user.UserLevel({{LEVEL}});
        user.UserShowLogin({{SHOW_LOGIN}});
        user.UserMailAddress(^{{MAIL}}^);
        user.UserPhoneNumber(^{{PHONE}}^);
        ! The user's favorite list, as saveUser creates it
        object favorites = dom.GetObject(ID_FAVORITES);
        if (favorites) {
            object userFavorite = dom.GetObject("_USER" # user.ID());
            if (!userFavorite) {
                object userFavorite = dom.CreateObject(OT_FAVORITE, "_USER" # user.ID());
            }
            if (userFavorite) {
                userFavorite.EnumType(etFavorite);
                userFavorite.Visible(false);
                favorites.Add(userFavorite.ID());
            }
        }
        if ({{AUTO_LOGIN}}) {
            users.UsersDefaultLogin(dwcPC, user.ID());
        } else {
            if (users.UsersDefaultLogin(dwcPC) == user.ID()) {
                users.UsersDefaultLogin(dwcPC, 0);
            }
        }
        Write("OK\t" # user.ID());
    } else {
        Write("NOT_FOUND");
    }
}
