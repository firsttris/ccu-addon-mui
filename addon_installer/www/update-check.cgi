#!/bin/tclsh

set checkURL "https://api.github.com/repos/firsttris/ccu-addon-mui/releases/latest"

puts -nonewline "Content-Type: text/html; charset=utf-8\r\n\r\n"

catch {
    set response [exec /usr/bin/wget -qO- --no-check-certificate $checkURL]
    regexp {"tag_name"\s*:\s*"v?([0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z]+\.[0-9]+)?)"} $response match newversion
}

if {[info exists newversion]} {
    puts -nonewline $newversion
} else {
    puts -nonewline "n/a"
}
