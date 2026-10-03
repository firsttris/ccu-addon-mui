! Writes the system protocol as the WebUI's systemProtocolLoader.htm reads
! it (dom.GetHistoryData): first "N <total>", then per entry
!   H <group> <date time> <kind> <name> <datapoint> <value> <text>
! kind is channel or sysvar; datapoint the HssType of a channel datapoint;
! text the value as the WebUI writes it for system variables
! (functions.fn::WriteDPText), empty for channel datapoints. Tabs and line
! breaks in values become spaces.
integer total;
string entry;
string lines = "";
foreach (entry, dom.GetHistoryData({{START}}, {{COUNT}}, &total)) {
    string group = entry.StrValueByIndex(";", 0);
    string archiveId = entry.StrValueByIndex(";", 1);
    string value = entry.StrValueByIndex(";", 2);
    string dateTime = entry.StrValueByIndex(";", 3);
    object historyDP = dom.GetObject(archiveId);
    if (historyDP) {
        object dp = dom.GetObject(historyDP.ArchiveDP());
        if (dp) {
            string kind = "channel";
            string name = dp.Name();
            string dpType = dp.HssType();
            string text = "";
            if (dp.IsTypeOf(OT_VARDP) || dp.IsTypeOf(OT_ALARMDP)) {
                kind = "sysvar";
                dpType = "";
                integer vt = dp.ValueType();
                integer st = dp.ValueSubType();
                if ((vt == ivtBinary) && ((st == istBool) || (st == istAlarm))) {
                    if ((value == "0") || (value == "") || (value == "false")) {
                        text = dp.ValueName0();
                    } else {
                        text = dp.ValueName1();
                    }
                }
                if ((vt == ivtInteger) && (st == istEnum)) {
                    text = web.webGetValueFromList(dp.ValueList(), value.ToInteger());
                }
                if ((vt == ivtFloat) && (st == istGeneric)) {
                    text = value.ToFloat().ToString(2) # " " # dp.ValueUnit();
                }
            } else {
                object channel = dom.GetObject(dp.Channel());
                if (channel) {
                    name = channel.Name();
                }
            }
            value = value.Replace("\t", " ").Replace("\r", " ").Replace("\n", " ");
            text = text.Replace("\t", " ").Replace("\r", " ").Replace("\n", " ");
            lines = lines # "H\t" # group # "\t" # dateTime # "\t" # kind # "\t" # name # "\t" # dpType # "\t" # value # "\t" # text # "\n";
        }
    }
}
Write("N\t" # total # "\n" # lines);
