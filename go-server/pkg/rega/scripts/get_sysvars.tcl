! Writes the system variables, several lines each, tab separated:
!   V <id> <visible> <name>
!   T <valueType> <valueSubType> <unit>
!   R <min> <max>
!   B <name of false> <name of true>
!   L <value list, ";" separated>
!   X <value>
!   I <description, %-encoded (% \t \r \n)>
string svId;
foreach (svId, dom.GetObject(ID_SYSTEM_VARIABLES).EnumUsedIDs()) {
    object sv = dom.GetObject(svId);
    WriteLine("V\t" # svId # "\t" # sv.Visible() # "\t" # sv.Name());
    WriteLine("T\t" # sv.ValueType() # "\t" # sv.ValueSubType() # "\t" # sv.ValueUnit());
    WriteLine("R\t" # sv.ValueMin() # "\t" # sv.ValueMax());
    WriteLine("B\t" # sv.ValueName0() # "\t" # sv.ValueName1());
    WriteLine("L\t" # sv.ValueList());
    WriteLine("X\t" # sv.Value());
    string info = sv.DPInfo().ToString();
    info = info.Replace("%", "%25");
    info = info.Replace("\t", "%09");
    info = info.Replace("\r", "%0D");
    info = info.Replace("\n", "%0A");
    WriteLine("I\t" # info);
}
