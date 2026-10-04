# API: WebSocket-Protokoll

App und Server sprechen über eine WebSocket-Verbindung mit JSON-Nachrichten. Dieses Dokument beschreibt
die Regeln und listet alle 133 Nachrichtentypen. Maßgeblich ist das Schema `protocol/schema.json`; daraus
entstehen die Typen der App, und die Go-Tests prüfen jede Nachricht des Servers dagegen.

## Verbindung

- **Endpunkt**: `ws://<CCU>/ws/mui` bzw. `wss://` über HTTPS. lighttpd leitet an den Server auf
  `127.0.0.1:8088` weiter.
- **Origin**: Schickt der Browser einen `Origin`, muss sein Hostname zum `Host` (oder `X-Forwarded-Host`)
  passen. Fremde Webseiten können sich also nicht verbinden. Ohne `Origin` (z. B. `websocat`) geht es.
- **Größe**: höchstens 128 KiB je Nachricht. Die größte Nachricht ist ein `subscribe` mit allen Kanaladressen.
- **Keepalive**: Ping alle 54 s, nach 60 s ohne Pong ist die Verbindung tot.
- **Reihenfolge**: Der Server arbeitet die Nachrichten einer Verbindung nacheinander ab. Der Sendepuffer
  fasst 1024 Nachrichten; ist er voll, verwirft der Server und schreibt es ins Log.
- **App-Seite**: Timeout je Anfrage 20 s (Backup länger), Neuverbinden alle 3 s ohne Begrenzung.

## Nachrichten

**Anfrage**: ein Objekt mit `type` und optional `requestId`. Die App vergibt `q1`, `q2`, …; der Server gibt
die ID in Antwort oder Fehler zurück.

```json
{"type": "setDatapoint", "requestId": "q42", "interfaceName": "HmIP-RF",
 "address": "0001D3C99C3C93:3", "attribute": "STATE", "value": true}
```

**Antwort**: meist `"<type>_response"` mit derselben `requestId`:

```json
{"type": "setDatapoint_response", "requestId": "q42", "success": true}
```

Ausnahmen aus historischen Gründen: `getRooms`, `getTrades` und `getChannels` antworten ohne `type`
(dafür mit `deviceId`), `getDeviceProblems` mit `deviceProblems`, `getParamsetDescription` mit
`paramsetDescription`, `getParamset` mit `paramset`, `listDevices` mit `devices`, `auth` und `login` mit
`auth_response`.

**Fehler**:

```json
{"type": "error", "requestId": "q43", "code": "ELEVATION_REQUIRED", "error": "enter the password again to change settings"}
```

`setDatapoint` meldet Fehler in der eigenen Antwort (`success: false`, `code`), damit die App das
optimistische Schalten zurücknehmen kann.

**Event** (vom Server, ohne Anfrage):

```json
{"event": {"interface": "websocket-server-HmIP-RF", "channel": "0001D3C99C3C93:3",
 "datapoint": "STATE", "value": true, "timestamp": "2026-10-04T10:40:12Z"}}
```

`interface` ist die Kennung, unter der sich der Server bei der CCU angemeldet hat.

## Anmeldung

Vor der Anmeldung sind nur `auth` und `login` erlaubt; alles andere beantwortet der Server mit
`AUTH_REQUIRED`.

1. Nach jedem Verbinden schickt die App `{"type": "auth", "token": …, "adminToken": …}` aus dem
   `localStorage`.
2. Ist das Token gültig: `auth_response` mit `success`, `user`, `level` (`admin`, `user`, `guest`),
   `elevated` und einem **erneuerten** Token, das die App speichert. Sonst `code: "LOGIN_REQUIRED"`.
3. `{"type": "login", "username", "password"}`: Der Server prüft bei der CCU und antwortet mit `token`
   (365 Tage), für Administratoren zusätzlich `adminToken` (8 Stunden). Fehler: `INVALID_CREDENTIALS`,
   `TOO_MANY_ATTEMPTS`, `CCU_UNREACHABLE`.
4. Ist das Admin-Token abgelaufen, antworten Einrichtungsaktionen mit `ELEVATION_REQUIRED`; die App fragt
   das Passwort ab und schickt `{"type": "elevate", "password"}`.

Format und Prüfung der Tokens stehen in [Sicherheit](sicherheit.md).

## Abos und Events

`{"type": "subscribe", "deviceId", "channels": ["<Adresse>", …]}` **ersetzt** die Kanäle, für die diese
Verbindung Events bekommt. Jede Verbindung hat ihr eigenes Abo, mehrere Tabs stören sich nicht. Die App
schickt das Abo nach jedem Neuverbinden erneut. Events für andere Kanäle bekommt die Verbindung nicht.

Systemvariablen erzeugen keine Events. Hat eine Verbindung sie mit `getSysvars` geladen, liest der Server
sie für alle solchen Verbindungen gemeinsam alle 5 Sekunden und schickt bei einer Änderung unaufgefordert
die ganze Liste: `{"type": "sysvars", "sysvars": [ … ]}` (ohne `requestId`, wie die Antwort auf
`getSysvars`). Nach dem Abmelden endet das.

## Rechte

| Kürzel | Wer darf |
|---|---|
| alle | jeder angemeldete Benutzer, auch Gast |
| Bed. | Benutzer und Administratoren (kein Gast) |
| Admin | Administratoren |
| Admin+T | Administratoren mit gültigem Admin-Token, sonst `FORBIDDEN` bzw. `ELEVATION_REQUIRED` |
| (A) | wird im Audit-Log festgehalten |
| (PW) | braucht zusätzlich eine WebUI-Sitzung (Passwort, danach gehalten) |

## Alle Nachrichtentypen

| Kategorie | Typ | Beschreibung | Recht |
|---|---|---|---|
| Anmeldung | `auth` | Gespeichertes Token prüfen und erneuern, Admin-Token übernehmen | ohne Login |
| | `login` | Mit CCU-Benutzer anmelden, liefert Token und Admin-Token | ohne Login |
| | `elevate` | Passwort erneut prüfen, liefert ein 8-h-Admin-Token | alle (nur Admin erfolgreich) |
| | `logout` | Eigene Session widerrufen | alle |
| | `listSessions` | Angemeldete Geräte auflisten | Admin+T |
| | `revokeSession` | Gerät abmelden, Verbindungen schließen | Admin+T (A) |
| | `getUserLanguage`, `setUserLanguage` | Sprache des angemeldeten Benutzers (0 automatisch, 1 Deutsch, 2 Englisch) in `userprofiles/<Benutzer>.lang`, wie `User.getLanguage`/`User.setLanguage` | Bed. (A) |
| | `changePassword` | Eigenes Passwort ändern (`set_user_password.tcl`), andere Sessions widerrufen | Bed. (A), nur `AUTH_MODE=ccu` |
| Bedienen und Anzeigen | `subscribe` | Kanaladressen für Events abonnieren (ersetzt die bisherige Menge) | alle |
| | `getRooms` | Räume (ReGa) | alle |
| | `getTrades` | Gewerke (ReGa) | alle |
| | `getChannels` | Kanäle eines Raums, Gewerks oder einer Favoritenliste oder `all` mit Datenpunkten, Status und Optionen, bei Eingängen mit Betriebsart (`mode`) | alle |
| | `setDatapoint` | Datenpunkt per ReGa setzen. Antwort `setDatapoint_response` mit `UNREACH`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_REQUEST`, `CCU_ERROR` | Bed. (A). Kanäle mit Option „bedienbar=aus“ dürfen nur Admins bedienen (`operable`, Cache 30 s) |
| | `getDeviceProblems` | Geräte mit LOW_BAT oder UNREACH | alle |
| | `getLayout` | Kachel-Layout einer Ansicht (ReGa-Metadaten `muiLayout`) | alle |
| | `setLayout` | Kachel-Layout speichern (für alle Geräte gleich) | Bed. (A) |
| | `getVirtualKeys` | Virtuelle Taster der CCU | alle |
| | `getDevicePrograms` | Programme, die ein Gerät verwenden | alle |
| Favoriten | `getFavorites` | Favoritenlisten, die der Benutzer sieht | alle |
| | `createFavorite`, `renameFavorite`, `deleteFavorite`, `addFavoriteItem`, `removeFavoriteItem` | Favoritenlisten pflegen (nur sichtbare Listen; `favorite_change.tcl`) | Bed. (A) |
| Systemvariablen und Programme | `getSysvars` | Systemvariablen mit Typ (bool, alarm, number, enum, string) | alle |
| | `setSysvar` | Systemvariable setzen | Bed. (A) |
| | `getPrograms` | Programme (aktiv, sichtbar, bedienbar) | alle |
| | `runProgram` | Programm ausführen. Nicht-Admins nur, wenn das Programm „bedienbar“ ist | Bed. (A) |
| | `setProgramActive` | Programm ein- oder ausschalten | Admin+T (A) |
| | `setLogicOption` | Option `visible`/`operate` einer Sysvar oder eines Programms | Admin+T (A) |
| | `getProgram` | Programm mit Regeln lesen (Editor) | alle |
| | `saveProgram` | Programm anlegen oder ändern (der Go-Code erzeugt das HM-Script) | Admin+T (A) |
| | `deleteProgram` | Programm löschen | Admin+T (A) |
| | `createSysvar`, `renameSysvar`, `deleteSysvar`, `editSysvar` | Systemvariablen verwalten | Admin+T (A) |
| Räume und Gewerke | `createGroup`, `renameGroup`, `deleteGroup` | Raum oder Gewerk anlegen, umbenennen, löschen (`list`) | Admin+T (A) |
| | `setGroupMember` | Kanal einem Raum oder Gewerk zuordnen bzw. entfernen | Admin+T (A) |
| Meldungen | `getServiceMessages` | Servicemeldungen. Bei `hideStickyUnreach` werden STICKY_UNREACH-Meldungen ausgeblendet und automatisch bestätigt | alle |
| | `acknowledgeServiceMessage` | Servicemeldung bestätigen | Bed. (A) |
| | `getAlarmMessages` | Alarmmeldungen | alle |
| | `acknowledgeAlarmMessage` | Alarm bestätigen | Bed. (A) |
| | `getHistory` | Systemprotokoll (seitenweise, optional pro Kanal) | alle |
| | `clearHistory` | Systemprotokoll löschen | Admin+T (A) |
| Geräte einrichten | `getParamsetDescription` | Paramset-Beschreibung (`VALUES` oder `MASTER`) per XML-RPC, gecacht | alle |
| | `getParamset` | Paramset-Werte (`VALUES` oder `MASTER`; andere Schlüssel ergeben `INVALID_REQUEST`) | alle |
| | `putParamset` | MASTER-Paramset schreiben (gegen die Beschreibung geprüft und konvertiert) | Admin+T (A) |
| | `listDevices` | Geräte aller Interfaces mit Kanälen, Link-Rollen und Firmware | alle (Gäste und Benutzer sehen Geräteeinstellungen schreibgeschützt) |
| | `rename` | Gerät oder Kanal umbenennen | Admin+T (A) |
| | `setChannelTile` | Kachel eines Kanals festlegen (`muiTile`: light/switch/leer) | Admin+T (A) |
| | `setChannelOption` | Kanaloptionen der WebUI (z. B. `usable`, sichtbar, protokolliert) | Admin+T (A) |
| | `installFirmware` | Geräte-Firmware-Update starten (XML-RPC `installFirmware`, BidCos `updateFirmware`) | Admin+T (A) |
| | `startComTest`, `pollComTest` | Funktionstest eines Geräts | Admin |
| Direkte Verknüpfungen | `getLinks` | Links eines Geräts oder Kanals | Admin |
| | `getAllLinks` | Links aller Interfaces | Admin |
| | `getLinkParamsetDescription`, `getLinkParamset` | Beschreibung und Werte eines Links | Admin |
| | `addLink`, `removeLink` | Link anlegen oder entfernen | Admin+T (A) |
| | `putLinkParamset` | Link-Parameter schreiben (geprüft) | Admin+T (A) |
| Anlernen | `setInstallMode` | Anlernmodus an oder aus. HmIP optional mit SGTIN und KEY (Whitelist) | Admin+T (A) |
| | `getInstallMode` | Restsekunden. Bei BidCos-RF zusätzlich `keyMismatch` | Admin |
| | `getInbox` | Neue, noch nicht übernommene Geräte | Admin |
| | `acceptDevice` | Gerät aus dem Posteingang übernehmen (ReGa) | Admin+T (A) |
| | `deleteDevice` | Gerät ablernen (`reset`, `force`) | Admin+T (A) |
| | `listReplaceableDevices` | Ersetzbare Geräte (nicht für HmIP) | Admin |
| | `replaceDevice` | Gerät ersetzen (nicht für HmIP) | Admin+T (A) |
| | `addDeviceBySerial` | BidCos-RF-Gerät per Seriennummer anlernen (`KEY_MISMATCH`) | Admin+T (A) |
| | `setTempKey` | Temporären BidCos-Schlüssel setzen | Admin+T (A, ohne Schlüssel) |
| | `searchWiredDevices` | RS485-Bus von BidCos-Wired nach neuen Geräten durchsuchen (landen im Posteingang) | Admin+T (A) |
| | `getInterfaces` | Angebundene Schnittstellen; BidCos-Wired nur mit Wired-Gateway | Admin |
| Heizungsgruppen | `getHeatingGroups` | Gruppen aus `groups.gson` | Admin |
| | `getHeatingGroupMembers` | Passende Mitglieder (HMServer) | Admin |
| | `saveHeatingGroup`, `deleteHeatingGroup` | Gruppe speichern oder löschen (HMServer und ReGa) | Admin+T (A)(PW) |
| Diagramme | `getDiagrams` | Diagramm-Definitionen und Energiepreis | alle |
| | `getDiagramData` | Aggregierte Messreihen (höchstens 2000 Buckets) | alle |
| | `saveDiagram`, `deleteDiagram` | Diagramm speichern oder löschen | Admin+T (A) |
| Push | `getPush` | VAPID-Public-Key und Abo-Status des Endpoints | alle |
| | `subscribePush`, `unsubscribePush` | Push-Abo anlegen oder entfernen | alle |
| | `testPush` | Testbenachrichtigung senden | alle |
| System | `getSystemInfo` | Add-on- und Firmware-Version, Funkmodule mit Duty Cycle | Admin |
| | `checkFirmwareUpdate` | Neueste CCU-Firmware online abfragen; ob die CCU sie selbst laden kann und wie viel Platz frei ist | Admin |
| | `getDeviceFirmware`, `getDeviceFirmwareChangelog` | Geräte-Firmware auf der CCU (`/etc/config/firmware`) und ihre Änderungen | Admin |
| | `checkDeviceFirmware` | Neueste Geräte-Firmware bei eQ-3 (eine Stunde zwischengespeichert) | Admin |
| | `downloadDeviceFirmware` | Geräte-Firmware von eQ-3 laden und über den HMServer auf die CCU legen | Admin+T (A) |
| | `prepareDeviceFirmwareUpload`, `addDeviceFirmware`, `deleteDeviceFirmware` | Firmware-Datei hochladen, entfernen | Admin+T (A) |
| | `getSystemSettings` | Standort, Zeitzone, Zeitserver, Fähigkeiten (Neustart, Uhr) | Admin |
| | `setLocation` | Koordinaten (ReGa und `time.conf`) | Admin+T (A) |
| | `setTimeServers`, `setTimeZone`, `setClock` | Uhr wie `cp_time.cgi` | Admin+T (A) |
| | `powerAction` | `reboot`, `shutdown` oder `safemode` (Neustart im abgesicherten Modus) der CCU | Admin+T (A) |
| | `setRegaVersion` | Logikschicht `NORMAL` oder `COMMUNITY` in `/etc/config/ReGaHssVersion` (nur eQ-3-Firmware, wie `User.setReGaVersion`); `getSystemSettings` liefert dann `regaVersion` | Admin+T (A) |
| | `getGeneralSettings` | Energiepreis, Info-LED, hideStickyUnreach, Beta-Firmware, Speicherbelegung | Admin |
| | `setGeneralSettings` | Diese Einstellungen schreiben | Admin+T (A) |
| | `getLogging` | Logging-Einstellungen | Admin |
| | `setLogging` | Logging-Einstellungen schreiben, syslogd neu starten | Admin+T (A) |
| | `downloadLogs` | Einmal-URL `/ws/mui/logs/<id>` | Admin+T (A) |
| | `runScript` | HM-Script prüfen (`SyntaxCheck`) und ausführen | Admin+T (A, Skript auf 200 Zeichen gekürzt) |
| Benutzer | `getUsers` | CCU-Benutzer | Admin |
| | `saveUser`, `deleteUser` | Benutzer anlegen, ändern oder löschen (nicht sich selbst löschen, eigene Stufe und eigenen Namen nicht ändern) | Admin+T (A) |
| Add-ons | `getAddons`, `checkAddonUpdate` | Zusatzsoftware und Update-Prüfung | Admin |
| | `addonAction` | `restart`/`uninstall` eines Add-ons | Admin+T (A) |
| Sicherheit | `getSecurity` | SSH, Auth, HTTPS-Redirect, Session-Timeout, Sicherheitsstufe | Admin |
| | `setSecurity` | SSH (+Passwort), Auth, HTTPS-Redirect | Admin+T (A)(PW) |
| | `setSecurityLevel` | LOW/MEDIUM/HIGH über `CCU.setSecurityLevel` | Admin+T (A)(PW) |
| | `setSnmp` | SNMP an (mit `snmpUser`, `snmpPassword` ab 8 Zeichen) oder aus, über `CCU.setSNMPEnabled`; das Passwort kommt nicht ins Audit-Log | Admin+T (A)(PW) |
| | `setSessionTimeout` | `rega.conf` | Admin+T (A) |
| | `changeSecurityKey` | Systemsicherheitsschlüssel ändern | Admin+T (A, ohne Schlüssel)(PW) |
| | `factoryReset` | Werkseinstellungen (Schlüssel wird vorher geprüft) | Admin+T (A)(PW) |
| | `getCertificate` | Infos zu `server.pem` | Admin |
| | `uploadCertificate`, `deleteCertificate` | Eigenes Zertifikat setzen oder löschen, lighttpd neu starten | Admin+T (A)(PW) |
| | `getFirewall` | Firewall-Konfiguration | Admin |
| | `setFirewall` | Firewall über `Firewall.setConfiguration` | Admin+T (A)(PW) |
| Netzwerk und Gateways | `getNetwork` | `netconfig`, aktuelle Adresse, Tailscale | Admin |
| | `setNetwork` | `netconfig` schreiben, Tailscale schalten | Admin+T (A) |
| | `getLanGateways` | LAN-Gateways (rfd.conf, hs485d.conf) mit Verbindungsstatus | Admin |
| | `setLanGateways` | Gateways konfigurieren (JSON-RPC) | Admin+T (A, ohne Schlüssel)(PW) |
| | `changeLanGatewayKey` | Schlüssel eines HMLGW2/HMWLGW ändern | Admin+T (A, ohne Schlüssel)(PW) |
| | `setBidcosInterface` | Gerät einem Funkmodul zuordnen (Roaming) | Admin+T (A) |
| Backup, Restore, Firmware | `createBackup` | WebUI-Backup erzeugen, Einmal-URL `/ws/mui/backup/<id>` | Admin+T (A)(PW) |
| | `prepareRestore`, `prepareCcuFirmware`, `prepareAddonUpload` | Upload-ID und URL `/ws/mui/restore/<id>` | Admin+T (A) |
| | `checkRestore` | Hochgeladenes Backup durch die WebUI prüfen (`needsKey`) | Admin+T (A)(PW) |
| | `restoreBackup` | Backup einspielen, CCU startet neu | Admin+T (A)(PW) |
| | `checkCcuFirmware` | Firmware-Datei prüfen, EULA liefern | Admin+T (A)(PW) |
| | `downloadCcuFirmware` | OpenCCU lädt die neueste Firmware selbst (`CCU.downloadFirmware`), SHA256 prüfen, EULA liefern | Admin+T (A)(PW) |
| | `installCcuFirmware`, `cancelCcuFirmware` | Firmware-Update starten oder verwerfen | Admin+T (A)(PW) |
| | `installAddon` | Hochgeladenes Add-on installieren (`reboot`-Flag) | Admin+T (A)(PW) |

## HTTP-Endpunkte

Dateien gehen nicht über den WebSocket, sondern über einmalige URLs, die eine Nachricht vorher ausgibt:

| Pfad | Methode | Zweck |
|---|---|---|
| `/ws/mui/backup/<id>` | GET | erzeugtes Backup herunterladen; einmal, höchstens 5 Minuten nach dem Erzeugen |
| `/ws/mui/restore/<id>` | POST | Datei hochladen für Restore, CCU-Firmware oder Add-on; einmal, 30 Minuten gültig, bis 1 GiB |
| `/ws/mui/logs/<id>` | GET | Logdateien der CCU, zusammengefügt; einmal, 5 Minuten |

Die ID hat 128 Bit Zufall und stammt aus einer Anfrage, die nur Administratoren mit Admin-Token stellen
dürfen.

## Fehlercodes

| Code | Bedeutung |
|---|---|
| `AUTH_REQUIRED`, `LOGIN_REQUIRED` | nicht angemeldet bzw. Token ungültig |
| `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `CCU_UNREACHABLE` | Anmeldung fehlgeschlagen, gesperrt, CCU nicht erreichbar |
| `FORBIDDEN` | Stufe reicht nicht (Gast schaltet, Nicht-Admin richtet ein) |
| `ELEVATION_REQUIRED` | Admin-Token fehlt oder ist abgelaufen |
| `PASSWORD_REQUIRED` | die Aktion braucht eine WebUI-Sitzung, Passwort nötig |
| `INVALID_MESSAGE`, `INVALID_REQUEST`, `INVALID_VALUE` | Nachricht kaputt, Feld fehlt, Wert außerhalb der Beschreibung |
| `NOT_FOUND`, `UNREACH` | Objekt unbekannt, Gerät nicht erreichbar (dann wird nichts gesendet) |
| `NOT_AVAILABLE`, `NOT_SUPPORTED`, `UNAVAILABLE` | Funktion abgeschaltet, nicht möglich (z. B. Gerätetausch bei HmIP), Push nicht verfügbar |
| `CCU_ERROR` | die CCU hat einen Fehler gemeldet |
| `KEY_MISMATCH`, `KEY_REQUIRED`, `KEY_WRONG`, `KEY_SAME`, `KEY_NOT_ALL_DEVICES`, `WRONG_KEY` | Sicherheitsschlüssel (Anlernen, Werkseinstellungen, Schlüssel ändern, Restore) |
| `INVALID_BACKUP`, `INVALID_FIRMWARE`, `FIRMWARE_TOO_OLD`, `ADDON_FAILED` | Datei abgelehnt |
| `PUSH_FAILED` | Push-Dienst hat abgelehnt |

## Das Schema

- `protocol/schema.json` (JSON Schema draft-07) enthält je Nachrichtentyp ein Paar aus Anfrage und Antwort
  sowie gemeinsame Definitionen (`ServerMessage`, `EventMessage`, `ErrorResponse`, …). Unbekannte Felder
  sind verboten.
- `npm run generate:protocol` erzeugt daraus `src/types/protocol.ts`. Die CI prüft, dass die Datei aktuell ist.
- `request()` in der App ist darüber typisiert: Typ der Anfrage rein, passender Typ der Antwort raus.
- `go-server/integration_test.go` validiert jede Nachricht, die der echte Server in den Tests schickt, gegen
  `#/definitions/ServerMessage`.

Wie man eine neue Nachricht hinzufügt, steht in [Entwicklung](entwicklung.md#eine-neue-nachricht).

## Ausprobieren

Mit [websocat](https://github.com/vi/websocat):

```bash
websocat ws://<IP-der-CCU>/ws/mui
{"type": "login", "username": "Admin", "password": "<Passwort>"}
{"type": "getRooms", "deviceId": "test"}
{"type": "getChannels", "deviceId": "test", "roomId": "1234"}
{"type": "subscribe", "deviceId": "test", "channels": ["0001D3C99C3C93:3"]}
```

Browser-Erweiterungen lehnt die Origin-Prüfung ab.
