! Sets an option of a program or system variable as the WebUI does:
! visible (programs.fn::SetVisible, system.fn::saveDpVisibility) or, for
! programs, operate (programs.fn::SetOperate: full access or read only for
! users other than administrators). Writes OK, a tab and the previous
! value, or NOT_FOUND.
object obj = dom.GetObject({{ID}});
string option = "{{OPTION}}";
boolean value = {{VALUE}};
boolean found = false;
if (obj) {
    boolean isProgram = obj.IsTypeOf(OT_PROGRAM);
    if (isProgram || obj.IsTypeOf(OT_VARDP) || obj.IsTypeOf(OT_ALARMDP)) {
        if (option == "visible") {
            found = true;
            Write("OK\t" # obj.Visible());
            obj.Visible(value);
        }
        if ((option == "operate") && isProgram) {
            found = true;
            Write("OK\t" # (obj.UserAccessRights(iulOtherThanAdmin) == iarFullAccess));
            if (value) {
                obj.UserAccessRights(iulOtherThanAdmin, iarFullAccess);
            } else {
                obj.UserAccessRights(iulOtherThanAdmin, iarRead);
            }
        }
    }
}
if (!found) {
    Write("NOT_FOUND");
}
