#!/bin/tclsh

set checkURL "https://api.github.com/repos/firsttris/ccu-addon-mui/releases/latest"

puts -nonewline "Content-Type: text/html; charset=utf-8\r\n\r\n"

catch {
    [regexp {tag_name": "v?([0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z]+\.[0-9]+)?)"} [exec /usr/bin/wget -qO- --no-check-certificate $checkURL] dummy newversion]
}

if {[info exists newversion]} {
    puts -nonewline $newversion
} else {
    puts -nonewline "n/a"
}
