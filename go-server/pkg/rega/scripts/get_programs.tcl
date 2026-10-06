! Writes one line per program: P <id> <active> <visible> <operate>
! <internal> <name>, tab separated. <operate>: users other than
! administrators may run it (UserAccessRights(iulOtherThanAdmin) ==
! iarFullAccess, as the WebUI's program list shows "bedienbar").
! <internal>: a system-internal program, which programlist.htm only lists
! on request (EnumEnabledInternalIDs).
! The copies the WebUI's editor works on are left out, as programlist.htm
! does (ProgramCopyID() == ID_ERROR).
string prgId;
foreach (prgId, dom.GetObject(ID_PROGRAMS).EnumUsedIDs()) {
    object prg = dom.GetObject(prgId);
    if (prg.ProgramCopyID() == ID_ERROR) {
        boolean operate = (prg.UserAccessRights(iulOtherThanAdmin) == iarFullAccess);
        WriteLine("P\t" # prgId # "\t" # prg.Active() # "\t" # prg.Visible() # "\t" # operate # "\t" # prg.Internal() # "\t" # prg.Name());
    }
}
