# Vergleich mit der CCU3-WebUI

Wie weit ersetzt das Add-on die WebUI der CCU3? Grundlage sind das Hauptmenü der WebUI
(`www/webui/js/mainmenu/admin.js`) und die Systemsteuerung (`www/config/control_panel.cgi` mit den
`cp_*.cgi`) aus [OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base). Jede Funktion dort ist eine Zeile
in den Tabellen unten.

## Ergebnis

| | |
|---|---|
| Funktionen der WebUI | **59 von 66 vorhanden (89 %)** |
| Fehlen | 8, meist Einzeloptionen; der größte Brocken sind die Kopplungen (Hue, Lightify) |
| Gerätetypen | alle 472 an HmIP, HmIP Wired, BidCos-RF und BidCos-Wired bedienbar, 95 % mit eigener Kachel für die Hauptfunktion ([Geräteunterstützung](geraete.md)) |

Legende: ✅ vorhanden · ➕ vorhanden und deutlich mehr als in der WebUI · ❌ fehlt

## Status und Bedienung

| Funktion der WebUI | | Im Add-on |
|---|:---:|---|
| Geräte | ✅ | *Alle Geräte* |
| Räume | ➕ | Dashboard mit Übersicht und Kacheln, anordnen per Drag & Drop |
| Gewerke | ➕ | wie Räume |
| Favoriten | ➕ | gleiche Listen wie in der WebUI, mit Kacheln, anlegen und bearbeiten in der App |
| Programme (ausführen) | ✅ | Liste mit *Ausführen* |
| Systemvariablen (setzen) | ✅ | Liste, direkt änderbar |
| Systemprotokoll | ✅ | mit Suche, Verlauf zusätzlich auf der Geräteseite |
| Diagramme | ➕ | jeder Datenpunkt und jede Systemvariable, ohne microSD-Karte, Kosten, CSV, als Kachel |
| Servicemeldungen | ➕ | live, bestätigen, Push aufs Handy |
| Alarmmeldungen | ➕ | live als Balken, bestätigen, Push aufs Handy |

## Programme und Verknüpfungen

| Funktion der WebUI | | Im Add-on |
|---|:---:|---|
| Programm-Editor | ✅ | Wenn / Sonst wenn / Sonst, alle Bedingungen und Aktivitäten |
| Zeitmodul | ✅ | alle Muster, Astro-Zeiten, Gültigkeit |
| Skript testen | ✅ | Syntaxprüfung und Ausgabe |
| Systemvariablen verwalten | ✅ | anlegen, bearbeiten, Kanalzuordnung, sichtbar und bedienbar |
| Direktverknüpfungen mit Vorlagen | ✅ | 722 Vorlagen der WebUI, sonst Expertenmodus |
| Virtuelle Taster | ✅ | auslösen, umbenennen |

## Geräte

| Funktion der WebUI | | Im Add-on |
|---|:---:|---|
| Neue Geräte anlernen | ✅ | HmIP auch mit KEY/SGTIN, BidCos per Seriennummer und mit fremdem Schlüssel |
| Posteingang | ✅ | übernehmen, Zähler im Menü |
| Geräteliste | ✅ | Suche, Sortierung, Filter für Probleme und Updates |
| Geräteeinstellungen | ➕ | passende Bedienelemente, Vorschau, Übertragungsstatus |
| Umbenennen, Räume und Gewerke | ✅ | auf der Geräteseite und unter *Räume & Gewerke* |
| Kanaloptionen (sichtbar, bedienbar, protokolliert, AES) | ✅ | |
| Gerät löschen | ✅ | mit und ohne Zurücksetzen |
| Gerät ersetzen | ✅ | BidCos, wie in der WebUI |
| Funktionstest | ✅ | |
| Geräte-Firmware | ➕ | Update starten (HmIP, BidCos, Access Points); neue Firmware direkt von eQ-3 auf die CCU laden statt herunter- und hochladen; Dateien verwalten |
| Wochenprogramme und Heizprofile | ➕ | Zeitleiste mit Kopieren, statt Tabelle mit Uhrzeitfeldern |
| Gruppen (Heizgruppen) | ✅ | anlegen, ändern, löschen |
| Wired-Gerätesuche (BidCos-Wired) | ✅ | wie in der WebUI, gefundene Geräte landen im Posteingang |

## Benutzer

| Funktion der WebUI | | Im Add-on |
|---|:---:|---|
| Benutzer anlegen, ändern, löschen | ✅ | |
| Berechtigungsstufen | ✅ | Gast, Benutzer, Administrator, wirksam auch im Add-on |
| Eigenes Passwort ändern | ✅ | im Menü |
| Favoriten je Benutzer | ✅ | |
| Automatisches Anmelden | ❌ | im Add-on bleibt jedes Gerät nach einmaligem Anmelden ohnehin angemeldet |
| Vereinfachte Verknüpfungskonfiguration ein/aus | ❌ | das Add-on zeigt immer Vorlagen und zusätzlich alle Parameter |
| Sprache je Benutzer | ❌ | das Add-on folgt der Sprache des Browsers |

## Systemsteuerung

| Funktion der WebUI | | Im Add-on |
|---|:---:|---|
| CCU-Firmware: Update suchen und einspielen | ➕ | OpenCCU lädt das Update selbst, mit Prüfsumme und Speicherprüfung |
| Neustart, Herunterfahren | ✅ | |
| Neustart im abgesicherten Modus | ✅ | wie `SafeMode.enter`: Zusatzsoftware startet einmalig nicht, auch das Add-on nicht |
| Protokollierung (Log-Level, Syslog, Logdateien) | ✅ | |
| ReGa-Version wählen (OpenCCU) | ❌ | |
| Backup erstellen | ✅ | |
| Backup einspielen | ✅ | |
| Sicherheitsschlüssel | ✅ | |
| SSH | ✅ | |
| Authentifizierung der Script-API | ✅ | |
| Umleitung auf HTTPS | ✅ | |
| Sitzungs-Timeout | ✅ | |
| Werkseinstellungen | ✅ | |
| Sicherheitsstufe | ✅ | |
| HTTPS-Zertifikat | ✅ | |
| SNMP | ❌ | |
| Zeit und Position | ✅ | |
| Netzwerk | ✅ | inkl. Tailscale auf OpenCCU |
| Firewall | ✅ | |
| LAN-Gateways | ✅ | |
| Funk-Konfiguration (Interface-Zuordnung, Roaming) | ✅ | |
| Zusatzsoftware | ✅ | anzeigen, installieren, neu starten, deinstallieren, Updates |
| Allgemeine Einstellungen | ✅ | Energiepreise, Info-LED, Beta-Firmware, Meldungen ausblenden |
| Kopplungen (Philips Hue, OSRAM Lightify) | ❌ | |
| Hilfe, Lizenzen | ❌ | Versionen stehen unter *System* |

## Schnittstellen

| Schnittstelle | | |
|---|:---:|---|
| HomeMatic IP (Funk) | ✅ | |
| HomeMatic IP Wired | ✅ | über den DRAP, wie in der WebUI |
| BidCos-RF | ✅ | inkl. LAN-Gateways |
| Virtuelle Geräte und Gruppen | ✅ | Heizgruppen |
| BidCos-Wired (RS485) | ✅ | angebunden, sobald ein Wired-Gateway eingerichtet ist; noch nicht an echter Wired-Hardware getestet |

## Rechnung

| Bereich | vorhanden | gesamt |
|---|---:|---:|
| Status und Bedienung | 10 | 10 |
| Programme und Verknüpfungen | 6 | 6 |
| Geräte | 13 | 13 |
| Benutzer | 4 | 7 |
| Systemsteuerung | 20 | 25 |
| Schnittstellen | 5 | 5 |
| **Summe** | **58** | **66** |

Nicht mitgezählt sind die Display-Einstellungen (gibt es nur auf CCU1/CCU2) und das versteckte
Entwicklerwerkzeug *devconfig*.

## Was es nur im Add-on gibt

- **Live-Updates** über WebSocket statt Abfrage alle 3 Sekunden
- **Push-Benachrichtigungen** für Alarme und Servicemeldungen
- **Als App installierbar**, für Handy, Tablet und Wand, hell und dunkel, mit WakeLock
- **Kacheln anordnen** per Drag & Drop, für alle Geräte gleich
- **Eigene Diagramme** für jeden Datenpunkt, ohne microSD-Karte
- **Angemeldete Geräte** sehen und einzeln abmelden
- **Admin-Token**: Einstellungen nur mit frischem Passwort, auch wenn ein Gerät dauerhaft angemeldet ist
- **Audit-Log** jeder Änderung mit altem und neuem Wert
- **Übertragungsstatus** für Geräteeinstellungen (gesendet, wartet auf das Gerät, übertragen)
- **Statt Tabellen**: Wochenprogramm als Zeitleiste, Dauer als ein Feld statt Faktor und Basis, Prozent als
  Schieberegler

## Geschwindigkeit

| | CCU3-WebUI | Add-on |
|---|---|---|
| Gerätewerte | Jeder offene Tab ruft alle 3 s `/esp/system.htm?action=UpdateUI` auf, ein ReGa-Skript über alle angezeigten Kanäle (`iseRefresher`, `iseRefrCycle = 3` in `webui.js`) | Die CCU meldet jede Änderung per XML-RPC an den Server, der sie per WebSocket nur an die Geräte schickt, die den Kanal anzeigen. Keine Abfrage für Gerätewerte |
| Seitenwechsel | ReGa erzeugt jede Seite als HTML (`.htm`, `.fn`) | Die App wechselt im Browser und lädt nur die Daten |
| Beim Öffnen | 40 Skripte und Stylesheets, 3,1 MB (`rega/pages/index.htm`: Prototype, jQuery, jQuery UI, Scriptaculous, jqPlot, Knockout, `webui.js` mit 1,9 MB) | 4 Dateien, 844 KB; die Verknüpfungsvorlagen (1,5 MB) erst, wenn man sie braucht. Danach kommt alles aus dem Cache des Service Workers |
| Server | Tcl-CGIs, ReGa | ein statisches Go-Binary (ARMv7, rund 8,6 MB), keine Laufzeit wie Node.js oder Java |

Systemvariablen meldet die CCU nicht per Event. Die fragt das Add-on alle 10 Sekunden ab, Alarme alle
15 Sekunden und Servicemeldungen jede Minute, zusätzlich sofort, wenn sich ein Wartungswert ändert.
