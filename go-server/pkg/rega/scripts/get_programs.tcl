! Writes one line per program: P <id> <active> <visible> <name>, tab separated
string prgId;
foreach (prgId, dom.GetObject(ID_PROGRAMS).EnumUsedIDs()) {
    object prg = dom.GetObject(prgId);
    WriteLine("P\t" # prgId # "\t" # prg.Active() # "\t" # prg.Visible() # "\t" # prg.Name());
}
