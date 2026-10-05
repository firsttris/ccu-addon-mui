#!/usr/bin/env tclsh

set checkURL "https://api.github.com/repos/firsttris/ccu-addon-mui/releases/latest"
set downloadURL "https://github.com/firsttris/ccu-addon-mui/releases/latest"

# Only "cmd" is read from the query: the WebUI calls this page with
# cmd=check_version for the version check and cmd=download for the release
# page, both with &version=... (cp_software.cgi). Setting any variable from
# the query would let the caller overwrite the URLs above, which end up in
# exec and in the redirect.
set cmd ""
catch {
    foreach pair [split $env(QUERY_STRING) &] {
        if {$pair == "cmd=download"} {
            set cmd "download"
        }
    }
}

if {$cmd == "download"} {
    puts -nonewline "Content-Type: text/html; charset=utf-8\r\n\r\n"
    puts "<html><head><meta http-equiv='refresh' content='0; url=$downloadURL' /></head></html>"
} else {
    puts -nonewline "Content-Type: text/plain; charset=utf-8\r\n\r\n"
    
    catch {
        regexp {"tag_name"\s*:\s*"v?([0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z]+\.[0-9]+)?)"} [exec /usr/bin/wget -qO- --no-check-certificate $checkURL] match newversion
    }
    
    if {[info exists newversion]} {
        puts -nonewline $newversion
    } else {
        puts -nonewline "n/a"
    }
}
