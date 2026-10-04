! Writes one line per program: P <id> <active> <visible> <operate> <name>,
! tab separated. <operate>: users other than administrators may run it
! (UserAccessRights(iulOtherThanAdmin) == iarFullAccess, as the WebUI's
! program list shows "bedienbar").
string prgId;
foreach (prgId, dom.GetObject(ID_PROGRAMS).EnumUsedIDs()) {
    object prg = dom.GetObject(prgId);
    boolean operate = (prg.UserAccessRights(iulOtherThanAdmin) == iarFullAccess);
    WriteLine("P\t" # prgId # "\t" # prg.Active() # "\t" # prg.Visible() # "\t" # operate # "\t" # prg.Name());
}
