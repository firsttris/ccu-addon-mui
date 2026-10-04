! Checks a HomeMatic script the way the WebUI's script editor does before
! running it (rega/esp/system.fn::SyntaxCheck, ths 2459). Writes nothing
! if it is fine, else ReGa's error message.
string code = ^{{CODE}}^;
Write(system.SyntaxCheck(code, "", "2459", ""));
