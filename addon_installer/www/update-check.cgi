#!/bin/tclsh

# Read current installed version
set ADDON_DIR "/usr/local/addons/mui"
set VERSION_FILE "$ADDON_DIR/VERSION"
set INSTALLED_VERSION "0.0.55"

if {[file exists $VERSION_FILE]} {
    set fp [open $VERSION_FILE r]
    set INSTALLED_VERSION [string trim [read $fp]]
    close $fp
}

# GitHub API URL to get latest release
set UPDATE_URL "https://api.github.com/repos/firsttris/ccu-addon-mui/releases/latest"

# Output format expected by CCU
puts "Content-Type: text/html; charset=utf-8"
puts ""

puts "<html><body>"
puts "<h3>MUI CCU Addon Update-Check</h3>"
puts "<p>Installierte Version: $INSTALLED_VERSION</p>"

# Try to fetch latest version from GitHub
if {[catch {
    set fd [open "|/usr/bin/wget -qO- --no-check-certificate $UPDATE_URL" r]
    set response [read $fd]
    close $fd
    
    # Parse JSON response to get tag_name (version)
    if {[regexp {"tag_name"\s*:\s*"v?([^"]+)"} $response match available_version]} {
        puts "<p>Verfügbare Version: $available_version</p>"
        
        if {$available_version != $INSTALLED_VERSION} {
            puts "<p style='color: green;'><b>Update verfügbar!</b></p>"
            puts "<p><a href='https://github.com/firsttris/ccu-addon-mui/releases/latest'>Download auf GitHub</a></p>"
        } else {
            puts "<p style='color: blue;'>Sie nutzen bereits die neueste Version.</p>"
        }
    } else {
        puts "<p style='color: orange;'>Konnte verfügbare Version nicht ermitteln.</p>"
    }
} err]} {
    puts "<p style='color: red;'>Fehler beim Update-Check: $err</p>"
}

puts "</body></html>"
