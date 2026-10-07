# Sicherheit

Das Add-on kann alles, was die WebUI kann, bis hin zu Firewall und Werkseinstellungen. Deshalb gelten die
Benutzer und Rechte der CCU, Einstellungen brauchen ein frisches Passwort, und jede Änderung wird
protokolliert.

## Anmeldung

- **CCU-Benutzer**: Die App schickt Benutzer und Passwort einmal an den Server, der sie bei der WebUI prüft
  (`Session.login`, sofort danach `Session.logout`). Das Passwort wird nirgends gespeichert, auch nicht im
  Browser.
- **Stufe**: Der Server liest die Berechtigung des Benutzers aus ReGa: Administrator, Benutzer oder Gast.
- **Sperre**: Nach 5 falschen Passwörtern innerhalb einer Minute ist die Anmeldung eine Minute gesperrt,
  und zwar für diesen Benutzer von diesem Gerät aus. Wer sich auf einem Gerät vertippt, sperrt also weder
  andere Benutzer noch denselben Benutzer auf seinen anderen Geräten aus. Als Adresse zählt hinter lighttpd
  der letzte Eintrag in `X-Forwarded-For`, den lighttpd selbst anhängt; davor stehende Einträge kann ein
  Client erfinden. Die Sperre gilt für Anmeldung, Admin-Token, Passwort ändern und die Passwortabfragen bei
  Backup und Restore.

### Auf openccu-lite

Dort meldet nicht das Add-on an, sondern openccu-lite: Jede Anfrage unter `/addons/` geht durch occulites
Sitzungs-Gate, das ohne Anmeldung auf `/login` umleitet und die Sitzung im Header `X-Occulite-Session`
weitergibt, auch am WebSocket-Upgrade. Der Server prüft sie bei occulited (`/api/auth/v1/state`, nur eine
angemeldete Sitzung mit derselben `sid` zählt) und übernimmt Benutzer und Stufe: *configure* und
*administer* sind Administratoren, *operate* Benutzer, *read* Gäste. Dem Header traut der Server nur im
Paket für openccu-lite; auf der CCU könnte ihn jeder Client selbst setzen. Offene Verbindungen prüfen die
Sitzung jede Minute neu und schließen sich, sobald sie endet (Abmelden in openccu-lite) oder einem anderen
Benutzer oder einer anderen Stufe gehört; ist occulited nur kurz nicht erreichbar, bleiben sie offen. Tokens,
Sitzungsliste und die erneute Passworteingabe gibt es dort nicht: Administratoren sind immer bestätigt,
`elevate` antwortet allen anderen `FORBIDDEN`. Das Add-on läuft als eigener Benutzer ohne Root und schreibt nur
in seine eigenen Verzeichnisse.

## Tokens

Nach der Anmeldung bekommt die App Tokens, die der Server mit HMAC-SHA256 signiert:

`base64url({Benutzer, Stufe, Bereich, Sitzung, Ablauf}) . base64url(HMAC)`

| | Bedien-Token | Admin-Token |
|---|---|---|
| bekommt | jeder Benutzer | nur Administratoren |
| gilt | 365 Tage, bei jeder Verbindung erneuert | 8 Stunden, nicht verlängerbar |
| erlaubt | was die Stufe in der CCU erlaubt: Gäste sehen, Benutzer bedienen | zusätzlich einrichten |
| neu | durch Anmelden | durch erneute Passworteingabe (`elevate`) |

So bleibt ein Wandtablet dauerhaft angemeldet, kann aber nicht die Firewall abschalten. Das Admin-Token
gehört zur Sitzung und zum Benutzer, mit dem es ausgestellt wurde.

Der Schlüssel liegt in `/usr/local/etc/config/mui-auth.key` (32 Byte, Modus 0600) und entsteht beim ersten
Start. Fehlt er und lässt er sich nicht anlegen, startet der Server nicht. Löschen macht alle Tokens
ungültig.

## Sitzungen

Jedes Token gehört zu einer Sitzung in `mui-sessions.json` (Modus 0600), mit Benutzer, Gerät (aus dem
User-Agent, z. B. „iPad · Safari“) und letzter Nutzung. Gespeichert sind höchstens 100 Sitzungen.

Eine Sitzung endet,

- wenn der Benutzer sich abmeldet,
- wenn ein Administrator sie unter *Angemeldete Geräte* abmeldet (offene Verbindungen werden sofort
  getrennt),
- wenn der Benutzer sein Passwort ändert (alle anderen Sitzungen),
- wenn ein Administrator Passwort, Stufe oder Namen des Benutzers ändert oder ihn löscht.

## Rechte

Der Server prüft jede Nachricht selbst; die App blendet nur aus, was ohnehin abgelehnt würde.

| Stufe | darf |
|---|---|
| Gast | ansehen |
| Benutzer | bedienen: schalten, Systemvariablen setzen, *bedienbare* Programme ausführen, Meldungen bestätigen, Favoriten pflegen, Kacheln anordnen |
| Administrator | zusätzlich einrichten, mit Admin-Token |

Dazu kommen die Regeln der CCU:

- Kanäle, die in der CCU nicht *bedienbar* sind, schalten nur Administratoren.
- Programme ohne *bedienbar* starten nur Administratoren.
- Favoritenlisten sieht nur, wer sie in der CCU sehen darf.
- Niemand kann sich selbst löschen oder die eigene Stufe ändern.
- Ansehen dürfen alle Stufen, was die WebUI ihnen zeigt (`mainmenu/user.js`: Status und Bedienung,
  Systemprotokoll, Diagramme), dazu die Geräteeinstellungen schreibgeschützt. Paramsets lassen sich nur als
  `VALUES` oder `MASTER` lesen; die Parameter von Direktverknüpfungen (`getLinkParamset`) bleiben
  Administratoren vorbehalten.

Aktionen, die die CCU nur in der WebUI anbietet (Backup, Firewall, Sicherheitsstufe …), laufen über eine
WebUI-Sitzung des Benutzers. Die hält der Server nach der ersten Passworteingabe im Speicher.

## Eingaben

- **ReGa**: Statt zu maskieren lehnt der Server alles ab, was ein Skript verändern könnte. Bezeichner müssen
  `^[a-zA-Z0-9_:.-]+$` entsprechen, IDs sind Zahlen, Namen dürfen keine Anführungszeichen, Backslashes oder
  Zeilenumbrüche enthalten, Werte sind Zahl, Wahrheitswert oder ein solcher Text.
- **Paramsets**: Jeder Wert wird gegen die Beschreibung der CCU geprüft (bekannt, schreibbar, im Bereich).
- **Dateien**: Uploads gehen nur an einmalige URLs mit 128 Bit Zufall, die ein Administrator mit Admin-Token
  vorher angefordert hat. Zertifikate werden vor dem Speichern als Schlüsselpaar geprüft.
- **Skripte**: *Skript testen* führt beliebiges HM-Script aus, wie in der WebUI, und ist deshalb
  Administratoren mit Admin-Token vorbehalten.

## Netzwerk

- Der Server lauscht nur auf `127.0.0.1:8088`. Erreichbar ist er über lighttpd, also mit derselben Adresse,
  demselben Zertifikat und derselben Firewall wie die WebUI.
- Die Origin-Prüfung verhindert, dass eine fremde Webseite im selben Browser eine Verbindung aufbaut.
- Der Event-Server auf Port 9099 bindet nur an `127.0.0.1`, solange er auf der CCU läuft.

## Audit-Log

Jede Änderung über das Add-on landet in `/usr/local/etc/config/mui-audit.log`, eine JSON-Zeile pro Änderung:

```json
{"time":"2026-10-04T10:41:03Z","user":"Admin","action":"setDatapoint","target":"HmIP-RF.00151BE9A1C2D3:4.LEVEL","previous":"0","value":0.4,"result":"OK"}
```

- Auch **abgelehnte** Versuche (`FORBIDDEN`, `ELEVATION_REQUIRED`, `UNREACH` …) werden festgehalten.
- Ab 512 KiB wird die Datei nach `.1` verschoben; es bleiben höchstens etwa 1 MiB.
- Die Datei liegt in `/usr/local/etc/config` und ist damit Teil des CCU-Backups.
- **Nie** im Log: Passwörter, das SSH-Passwort, das SNMP-Passwort, der Sicherheitsschlüssel, temporäre BidCos-Schlüssel, der
  KEY von HmIP-Geräten und die Schlüssel von LAN-Gateways. Skripte werden nach 200 Zeichen gekürzt.

## Ohne Anmeldung (`AUTH_MODE=none`)

Mit `AUTH_MODE=none` in `mui.conf` entfällt die Anmeldung, und **jeder im Netz ist Administrator**. Das ist
nur für Netze gedacht, in denen das gewollt ist. Was eine WebUI-Sitzung braucht, fragt trotzdem das Passwort
des Benutzers `Admin` ab. Sitzungen und Abmelden gibt es dann nicht.

## Was das Add-on nicht tut

- Es ändert keine Dateien der Firmware und keine WebUI-Seiten. Was es schreibt, schreibt auch die WebUI.
- Es öffnet keinen Port nach außen und baut keine Verbindung ins Internet auf, außer für Push (an die
  Push-Dienste der Browser), die Suche nach Updates (GitHub, OpenCCU bzw. eQ-3) und die Update-Prüfung von
  Add-ons.
- Es sammelt keine Daten.
