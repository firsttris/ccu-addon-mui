# Plan: openccu-lite unterstützen

Stand: Oktober 2026, openccu-lite `v1.0.0-dev.42`. Dieser Plan beschreibt, wie das Add-on neben CCU3 und
OpenCCU auch auf [openccu-lite](https://github.com/hobbyquaker/openccu-lite) läuft, aus einem Branch und
einer Codebasis.

## Stand der Umsetzung

Die Schritte 1 bis 8 sind umgesetzt und mit Tests gegen die Fake-CCU im Lite-Modus abgesichert
(`go test -tags lite ./...`, `e2e/lite.spec.ts`); der Branch baut beide Pakete. Offen ist nur, was ein
echtes openccu-lite braucht:

- [ ] Test auf einer echten openccu-lite-VM: automatisch in `lite-vm.yml` (Installation, Anmeldung über das
  Gate, Neustart, Update, Journal, Abmelden; ohne Funkmodul), dazu einmal von Hand mit Funk-Hardware nach der
  Checkliste unten (Abschnitt *Tests*).
- [ ] Release mit den Lite-Paketen und ihren `.sha256` (der Build erzeugt beides).
- [ ] Pull Request auf occulites [`catalog/catalog.json`](https://github.com/hobbyquaker/occulited/blob/master/catalog/catalog.json)
  mit dem Eintrag
  `{"git": "https://github.com/firsttris/ccu-addon-mui", "manifest": "addon_installer/openccu-lite.json"}`.
  Das System liest das Manifest an der neuesten Release, also erst nach einer Release mit dieser Datei.
- [ ] Die offenen Fragen an Sebastian (unten), vor allem Layouts pro Raum, gemeinsame Favoriten und die
  Stufe für Namen und Räume.

Abweichungen vom Plan:

- **Favoriten** liegen vorerst in der eigenen Datei `mui-lite.json`, nicht im `favorite`-Enum von
  occulited: Dort hat jedes Konto genau eine Liste, MUI kennt mehrere benannte Listen.
- **Gerätefirmware** verwaltet occulites Update-Seite; MUI zeigt dort nur den Link. Das Update eines
  einzelnen Geräts aus seiner Geräteseite geht weiter.
- **Gerätebilder** gibt es auf openccu-lite nicht (keine WebUI-Dateien); die Kacheln zeigen dort ihr Symbol.
- **Im Lite-Binary** steckt noch der ReGa-Client, weil `websocket.Server` ihn als Feld kennt. Erreichbar ist
  er dort nicht: Der Verteiler schickt keine Anfrage an die CCU-Handler, deren Dateien gar nicht mitgebaut
  werden. Ganz heraus käme er erst, wenn auch die übrigen gemeinsamen Handler hinter Schnittstellen liegen.

## Code-Review und was daraus wurde

Ein Review des PRs ([#191](https://github.com/firsttris/ccu-addon-mui/pull/191), zwei Durchgänge) fand
14 Punkte. Umgesetzt im Commit „Review-Findings zu openccu-lite umgesetzt“, die Funktionsfehler jeweils mit Test:

| # | Finding | Umsetzung |
|---|---|---|
| A1 | `saveDiagram` lief auf openccu-lite in einen nil-ReGa-Client (Panic, keine Antwort) | Kanäle der neuen Reihen aus `home.Source`; der Import aus dem Systemprotokoll nur mit `capabilities.history`, Systemvariablen-Reihen nur mit `capabilities.sysvars`. Test `TestLiteLimits`. |
| A2 | Raum/Gewerk-Zuordnung ignorierte die Räume, die ein Kanal von seinem Gerät erbt | `setGroupMember` geht von den angezeigten (ggf. geerbten) Räumen aus und macht sie zu den eigenen des Kanals; dazu `meta.mui.ownEnums`, damit „aus dem letzten Raum nehmen“ hält und nicht wieder die Räume des Geräts zeigt. Test `TestLiteInheritedRooms`. |
| A3 | Servicemeldungen außer `STICKY_*` ließen sich nicht quittieren (NOT_FOUND) | occulites Meldungen sind nur lesbar (`docs/system-api.md`, `GET /service-messages`); sie enden, wenn das Gerät es meldet. Der Server antwortet dafür `NOT_SUPPORTED`, die App zeigt „Bestätigen“ auf openccu-lite nur bei Sticky-Meldungen. |
| A4 | Sprachprofile wurden nach `/etc/config/userprofiles` geschrieben | Auf openccu-lite unter `DATA_DIR/userprofiles`. |
| A5 | Abgelaufene openccu-lite-Sitzung führte in das eigene, dort nutzlose Login-Formular | Neuer Code `SESSION_REQUIRED`; die App zeigt „Sitzung abgelaufen“ mit Link auf occulites `/login` (im ganzen Fenster). E2E `e2e/lite-session.spec.ts`. |
| B1 | Die Sitzung wurde nur beim WebSocket-Upgrade geprüft | Jede offene Verbindung prüft sie jede Minute neu und schließt sich, wenn sie endet oder einem anderen Benutzer/einer anderen Stufe gehört. Ist occulited nur nicht erreichbar, bleibt sie offen (`CheckSession` unterscheidet „keine Sitzung“ von „Fehler“). Test `TestWatchGate`. |
| B2 | `elevate` meldete auf openccu-lite jedem Erfolg | Nur Administratoren, sonst `FORBIDDEN`. |
| C1 | `getSysvars`/`getPrograms` wurden auf openccu-lite trotzdem gesendet | `useSysvars`/`usePrograms` fragen nur mit der Fähigkeit (`useCapabilities()`); die Auswahllisten in Favoriten- und Diagramm-Editor bleiben damit ohne diese Einträge. E2E prüft, dass nichts gesendet wird. |
| D1 | Zweiter Raum mit langem Namen bekam eine Knoten-ID über 32 Zeichen | Erst Suffix, dann kürzen (`uniqueSlug`). Test `TestUniqueSlug`. |
| E1 | `defaultName` las für jeden unbenannten Kanal alle Geräte neu (quadratisch) | Nimmt den Gerätetyp aus der schon gelesenen Beschreibung. |
| E2 | `getChannels` eines Raums baute alle Kanäle und filterte danach | Filtert die Gerätebeschreibungen zuerst und baut nur die Mitglieder, wie das ReGa-Script der CCU. |
| E3 | N+1 bei Heizgruppen | **Nicht umgesetzt:** `GET /groups` liefert nur `{id, name, type, type_label, device, ref}` (occulited `docs/system-api.md`); Mitglieder, `device_name` und `forbid_single_operation` gibt es nur pro Gruppe. |
| F1 | Toter `regaClient`-Zweig in `virtual_keys.go` | Entfernt; die virtuellen Taster kommen immer aus `home.Source`. |
| F2 | Falscher Dateiverweis im Kommentar | `src/hooks/capabilities.ts`. |

## Weitere Module auf openccu-lite

Die Idee von MUI ist eine komplette Oberfläche für die Zentrale. Auf der CCU ersetzt es die WebUI fast
ganz; auf openccu-lite fehlen bisher Module, teils weil wir sie noch nicht gebaut haben, teils weil
openccu-lite sie einem Add-on nicht erlaubt. Was ein Add-on dort darf, legen die Rechte (Scopes) seines
Tokens fest: Es bekommt, was sein Manifest unter `runtime.api_scopes` verlangt, aber **nie** `auth:admin`,
`power`, `backup`, `radio:keys` oder `*` (occulited `docs/system-api.md`, „Scopes“).

### Möglich, aber noch nicht gebaut

Diese Module gingen mit Rechten, die ein Add-on bekommen kann. Wir haben sie bisher weggelassen, weil
openccu-lite dafür eigene Seiten hat und wir dorthin verlinken. Für eine komplette Oberfläche ließen sie
sich nachrüsten:

| Modul | occulites API | Recht | Hinweis |
|---|---|---|---|
| Netzwerk, Firewall, Zeit, SSH | `/api/system/v1/network`, `/firewall`, `/time`, … | `system:write` | Fernzugriff (klassisches RPC) ebenso |
| Zertifikat, HTTPS | `/api/system/v1/certificate` | `system:write` | inkl. ACME |
| Gerätefirmware laden und verteilen | `/api/system/v1/firmware` | `system:write` | heute nur Link auf occulites Update-Seite |
| Zusatzsoftware: Liste, Installieren, Updates, Katalog | `/api/system/v1/addons` | `addons:write` | |
| Protokoll (Journal) | `/api/system/v1/log` | `logs:read` | auch das eigene Log des Add-ons |
| LAN-Gateways, Funkmodul-Einstellungen | `/api/system/v1/radio/…` | `system:write` | ohne die Firmware des Funkmoduls (`power`) |
| Statusleuchte | `/api/system/v1/led` | `led` | |
| Diagramme aus der Historie | `/api/rpc/v1/history` | `rpc:read` | letzte 500 Werte je Datenpunkt, nur für occulites Liste von Datenpunkten |
| Kanaloptionen (sichtbar, bedienbar) | eigener Namensraum `meta.mui` | `meta:write` | gibt es auf openccu-lite nicht, MUI müsste sie selbst führen; `meta.mui` nutzt MUI bisher nur für `ownEnums` (Räume eines Kanals) |
| Favoriten gemeinsam mit occulites Bedien-App | Enum `favorite` | `meta:write` | dort eine Liste je Konto, MUI kennt mehrere |

### Nur über die Sitzung eines Administrators

Diese APIs gibt es, ein Add-on-Token bekommt das Recht dafür aber nie. Der Server könnte sie mit der
Sitzung des angemeldeten Administrators aufrufen (`X-Occulite-Session`), das umginge aber die Grenze, die
openccu-lite bewusst zieht. Vorher mit Sebastian klären:

| Modul | occulites API | Recht |
|---|---|---|
| Benutzerverwaltung (Konten, Stufen, Passkeys, OIDC, API-Tokens) | `/api/auth/v1/users`, `/tokens`, `/config` | `auth:admin` |
| Backup erstellen und herunterladen | `/api/system/v1/backup` | `backup` |
| Wiederherstellen, Firmware-Update der Zentrale, Neustart, Herunterfahren | `/api/system/v1/…` | `power` |
| HmIP-Geräteschlüssel, lokaler Schlüsselmodus | `/api/system/v1/radio/hmip/…` | `radio:keys` |

### Gibt es auf openccu-lite nicht

Ohne ReGa fehlen die Grundlagen; keine API, auch keine gesperrte:

- **Programme und Systemvariablen**, **Alarme** und das **Systemprotokoll** der ReGa. Ein Ersatz wäre eine
  eigene Automatisierung in MUI: Die Benachrichtigungsregeln laufen schon ohne ReGa (Bedingungen auf
  Datenpunkten, geprüft bei jedem Event) und könnten um Aktionen erweitert werden, etwa „schalte Kanal X“.
  Das wäre ein eigenes, größeres Modul.
- **Funktest** (`Device.startComTest` der ReGa); zu prüfen, ob ihn die Funkdienste direkt anbieten.
- **Servicemeldungen bestätigen**, außer den Sticky-Meldungen: occulites Meldungen sind ein Abbild der
  Wartungsdatenpunkte, sie enden, wenn das Gerät es meldet. `STICKY_UNREACH` und `STICKY_SABOTAGE` setzt
  MUI wie die CCU per `setValue` zurück.
- **Gerätebilder**: Sie liegen bei der CCU in den Dateien der WebUI. Mitliefern ginge nur mit Klärung der
  Rechte an den Bildern von eQ-3.

## Worum es geht

openccu-lite ist ein Fork von OpenCCU ohne ReGaHSS. Der Funk-Stack (`rfd`, `hs485d`, `HMIPServer`) bleibt,
die Systemverwaltung übernimmt der Go-Dienst [occulited](https://github.com/hobbyquaker/occulited). Es gibt
eine Bedien-App für Kacheln, aber keine Verwaltung der Homematic-Geräte: kein Anlernen, keine
Geräteeinstellungen, keine Direktverknüpfungen. Dafür gibt es bisher nur Homematic Manager und OpenCCU-Loom.
Genau diese Lücke füllt unser Add-on, und der Maintainer hat ausdrücklich darum gebeten.

Was wegfällt: Systemvariablen, Programme, HM-Script, die Alarm- und Servicemeldungs-Variablen der ReGa,
`/api/homematic.cgi` und `/config/*.cgi`. Was dazukommt, ist eine ordentliche API:

| API | Wofür wir sie brauchen |
| --- | --- |
| Metadata API `/api/meta/v1` | Namen, Räume, Gewerke, Favoriten, mit Änderungs-Events (SSE) |
| lite-rpc `/api/rpc/v1` | `/state` (alle wichtigen Werte in einem Aufruf), `/history`, Event-Stream mit Nachholen |
| System API `/api/system/v1` | Servicemeldungen, Heizgruppen, Gerätefirmware, Add-on-Liste, Journal |
| Auth API `/api/auth/v1` | Wer angemeldet ist und mit welcher Stufe |

Quellen: `docs/11-openccu-lite.md` und `docs/12-porting-to-openccu-lite.md` im
[ccu-addon-howto](https://github.com/homematic-community/ccu-addon-howto), `docs/porting-from-rega.md` und
`docs/addons.md` in openccu-lite, `docs/meta-api.md`, `docs/meta-format.md`, `docs/system-api.md` und
`docs/manifest-format.md` in occulited.

## Grundidee: ein Branch, zwei Pakete

Alles bleibt in `main`. Was sich unterscheidet, liegt hinter einer Schnittstelle im Go-Server, und
Go-Build-Tags entscheiden, welche Umsetzung ins Binary kommt:

```text
go build ./              → CCU-Paket: mit ReGa, ohne Lite-Code
go build -tags lite ./   → Lite-Paket: mit Lite-API, ohne ReGa-Code
```

```text
pkg/backend/backend.go   gemeinsam: die Schnittstelle(n)
pkg/backend/ccu.go       //go:build !lite   → pkg/rega, homematic.cgi, /etc/config
pkg/backend/lite.go      //go:build lite    → pkg/occulite (Metadata-, System-, Auth-API)
```

`pkg/rega` wird nur von `ccu.go` importiert und fällt im Lite-Build damit komplett raus, umgekehrt genauso.
Handler, die es nur auf der CCU gibt (Programme, Systemvariablen, Systemeinstellungen), registrieren sich in
Dateien mit `//go:build !lite`. Im Lite-Binary existieren sie nicht.

Gemeinsam bleibt der größte Teil: das WebSocket-Protokoll, XML-RPC zu den Funk-Diensten (Anlernen,
Paramsets, Direktverknüpfungen, Schalten), Kachel-Logik, Regeln, Push, Diagramme und die Auslieferung der
App.

### Der Lite-Teil wird schlanker, nicht dicker

Vieles, was wir heute selbst bauen, weil ReGa und XML-RPC es nicht können, bringt Lite fertig mit. Diese
Umwege wandern hinter die Schnittstelle in den CCU-Teil, der Lite-Teil nutzt die API:

| Heute (CCU) | Auf Lite |
| --- | --- |
| HM-Script `get_channels.tcl` liefert Namen, Räume und Werte, Parsen der Ausgabe | `GET /api/meta/v1/snapshot` plus `GET /api/rpc/v1/state` |
| Räume und Namen erneut abfragen, wenn sich etwas ändert | `GET /api/meta/v1/events/sse` mit `?since=<revision>` |
| Servicemeldungen aus ReGa-Variablen pollen | `GET /api/system/v1/service-messages/stream` |
| Heizgruppen über HMServer-Seiten mit WebUI-Sitzung | `/api/system/v1/groups` |
| Gerätefirmware über HMServer mit WebUI-Sitzung | `/api/system/v1/firmware` |
| Passwort über `Session.login` prüfen, Stufe aus ReGa | Header `X-Occulite-Session` und `GET /api/auth/v1/state` |

### Frontend: ein Build für beide

Es gibt heute keine Feature-Flags, nur `userLevel` und `elevated`. Neu schickt der Server in der
`auth_response` mit, was er kann:

```json
{ "platform": "lite", "capabilities": { "programs": false, "sysvars": false, "system": false, "alarms": false } }
```

Die App blendet danach Menüpunkte (`src/components/Header.tsx`), die Einrichten-Navigation
(`src/views/setup/SetupShell.tsx`), die System-Panels (`src/views/setup/SystemInfo.tsx`) und Geräte-Tabs
(`src/views/setup/deviceTabs.ts`) aus. Die Seiten selbst werden erst beim Öffnen geladen, ihr Code im Paket
kostet also nichts.

## Was aus jeder Funktion wird

Von den 151 Aufrufen in `protocol/schema.json`:

| Klasse | Anzahl | Bedeutung |
| --- | --- | --- |
| A | 39 | läuft unverändert über XML-RPC oder eigene Dateien |
| B | 41 | braucht eine Lite-Umsetzung über die neue API |
| C | 28 | gibt es auf Lite nicht, wird ausgeblendet |
| D | 43 | macht occulited selbst, wird ausgeblendet |

**Läuft weiter (A):** Paramsets, Anlernen (`setInstallMode`, `addDeviceBySerial`, Wired-Suche), Gerät
löschen und ersetzen, Direktverknüpfungen, Gerätefirmware installieren, Regeln, Push, Diagramme (ohne
Systemvariablen-Reihen und ohne Import aus der ReGa-Historie), Sitzungen.

**Neu für Lite (B):**

- Räume, Gewerke, Kanäle, Umbenennen, Gruppen anlegen und befüllen: Metadata API. Räume und Gewerke sind
  dort Pfad-Bäume (`room/eg/wohnzimmer`), Kanäle heißen `BidCos-RF.ADRESSE:1` statt numerischer IDs.
- Schalten (`setDatapoint`): heute über ReGa `.State()`, auf Lite direkt `setValue` per XML-RPC, mit dem
  Typ aus der Paramset-Beschreibung.
- Geräteliste mit Namen: XML-RPC `listDevices` plus Namen aus der Metadata API. **Neu angelernte Geräte
  haben dort keinen Namen**, occulited legt keine Objekte an. Wir zeigen Typ und Adresse und legen das
  Objekt beim ersten Umbenennen per `PATCH` an.
- Posteingang (`getInbox`, `acceptDevice`): aus den `newDevices`-Events selbst führen, statt aus ReGa.
- Servicemeldungen und Gerätegesundheit: System API bzw. die Wartungskanäle `:0` per XML-RPC.
- Heizgruppen, Gerätefirmware-Verwaltung: System API.
- Kachel-Layouts (`muiLayout`), Kachelwahl (`muiTile`), Kanalmodus: heute als ReGa-Metadaten, auf Lite in
  einer eigenen Datei unter `/usr/local/etc/config/addons/mui/`. Die Metadata API kann pro Objekt nur 16 KiB
  für alle Add-ons zusammen speichern und hat keine Daten an Räumen. Für Layouts pro Raum ist eine eigene
  Datei sauberer.
- Favoriten: Lite hat ein Enum `favorite` mit einem Knoten pro Benutzerkonto und die Reihenfolge in
  `meta.occulite.order`. Das nutzen wir, dann sieht der Nutzer in occulites App und bei uns dieselben
  Favoriten.
- Sprache pro Benutzer: aus `/etc/config/userprofiles` in unser eigenes Verzeichnis
  (`DATA_DIR/userprofiles`).
- Systeminfo: `/VERSION` plus `GET /api/meta/v1/version`, ohne ReGa-Build.
- Selbst-Update: auf Lite ausblenden und auf die Add-on-Seite von occulited verweisen (`/addons`).

**Gibt es nicht (C):** Systemvariablen, Programme, Skript ausführen, Alarme, Kanal-Optionen der ReGa
(Sichtbarkeit, Archiv), Sitzungs-Timeout der ReGa, die ReGa-Historie (`getHistory`). Lite hat eine eigene
Historie mit den letzten 500 Werten je Datenpunkt, die können wir später für Diagramme nutzen.

**Macht occulited (D):** Firewall, Netzwerk, Zeit, Zertifikate, SSH und Sicherheit, Benutzer, Backup und
Wiederherstellung, Firmware der Zentrale, Add-ons, Logging, LAN-Gateways, Neustart. Statt der Seiten zeigen
wir einen Link auf die jeweilige Seite von occulited.

### Programme auf Lite

Ohne ReGa gibt es keine Programme. Statt die Seite einfach zu verstecken, zeigen wir einen kurzen Hinweis:
Automationen laufen auf openccu-lite in einem eigenen System. Ist RedMatic oder ein anderes
Automations-Add-on installiert (Add-on-Liste der System API), verlinken wir direkt darauf, sonst auf den
Katalog. Direktverknüpfungen bleiben, die laufen zwischen den Geräten und decken viele einfache Fälle ab.

## Anmeldung auf Lite

- Jede Anfrage unter `/addons/` geht durch occulites Sitzungs-Gate. Ohne Anmeldung leitet lighttpd auf
  `/login` um, wir brauchen also keinen eigenen Login-Dialog.
- Das Gate hängt den Header `X-Occulite-Session` an jede Anfrage, auch an den WebSocket-Upgrade. Der Server
  prüft ihn mit `GET http://127.0.0.1/api/auth/v1/state` (`Authorization: Bearer <Wert>`) und übernimmt
  Benutzer und Stufe.
- Stufen von Lite auf unsere: `read` → guest, `operate` → user, `configure` und `administer` → admin. Die
  Admin-Bestätigung per Passwort („elevate“) entfällt auf Lite, das regelt occulites Stufe: Administratoren
  sind immer bestätigt, alle anderen bekommen `FORBIDDEN`.
- Offene Verbindungen prüfen die Sitzung jede Minute neu; ein Abmelden in openccu-lite beendet sie. Ohne
  gültige Sitzung antwortet der Server `SESSION_REQUIRED`, und die App schickt zu occulites `/login`
  statt ihr eigenes Login-Formular zu zeigen.
- Für eigene API-Aufrufe ohne Benutzer (Events, Servicemeldungen im Hintergrund) nutzen wir das Add-on-Token
  `/run/occulite/addon-tokens/mui.api` mit den Rechten aus dem Manifest.
- Dem Header trauen wir nur auf Lite. Auf der CCU kann ihn jeder Client selbst setzen.

## Paket für Lite

- **Erkennung:** `LITE=` in `/VERSION` oder ausführbares `/usr/bin/occulited`. Das Lite-Binary verweigert
  den Start auf einer CCU und umgekehrt, mit klarer Meldung im Log.
- **Architekturen:** aarch64 (Pi 3/4/5) und x86_64 (OVA). Wir bauen heute ARMv7 und amd64, aarch64 kommt
  dazu.
- **Manifest** `openccu-lite.json` im Paket, geprüft gegen occulites `manifest.schema.json`:

  ```json
  {
    "format": 1,
    "id": "mui",
    "name": "MUI",
    "description": { "de": "Geräte verwalten und bedienen", "en": "Manage and operate devices" },
    "homepage": "https://github.com/firsttris/ccu-addon-mui",
    "licence": "MIT",
    "release": { "github": "firsttris/ccu-addon-mui", "asset": "mui-{version}-{arch}-lite.tar.gz" },
    "requires": { "architectures": ["aarch64", "x86_64"] },
    "ui": { "session_header": true },
    "runtime": {
      "daemon": true,
      "api_scopes": ["meta:write", "rpc:configure", "system:read", "system:write"],
      "note": { "de": "Spricht mit rfd, HMIPServer und hs485d über die lokalen Ports.", "en": "Talks to rfd, HMIPServer and hs485d on the local ports." }
    }
  }
  ```

- **Ohne Root:** Das Add-on läuft als `addon-mui` und darf nur in sein eigenes Verzeichnis,
  `/usr/local/etc/config/addons/mui/` und `/run/addon-mui/` schreiben. PID-Datei nach `/run/addon-mui/`,
  Logs auf stdout (landen im Journal), Daten (`mui-*.json`, Diagramme) nach
  `/usr/local/etc/config/addons/mui/`.
- **rc.d:** Daemon in `start` starten, nie in `init`. `stop` muss auch funktionieren, wenn der Prozess
  schon weg ist.
- **lighttpd:** Die Proxy-Konfiguration liegt als `etc/lighttpd.conf` im Add-on, occulited prüft und
  übernimmt sie. Nur `proxy.server` auf 127.0.0.1, Rewrites und Header, alles unter `/addons/mui/`.
  WebSockets gehen durch.
- **Einbettung:** occulites Oberfläche zeigt uns im iframe und hängt `?theme=…&lang=…` an. Wir übernehmen
  Hell/Dunkel und Sprache daraus und hören auf `postMessage` `openccu-lite:theme`.
- **Interfaces:** Die Ports kommen schon heute aus `/etc/config/InterfacesList.xml`, die Rückrufe an
  127.0.0.1 funktionieren auf Lite. Neu ist das Warten beim Start: `init` nach 1, 2, 4 und 8 s wiederholen,
  dann alle 15 s, und das ohne Warnungen im Log, solange der Funk-Dienst noch nicht da ist.
- **Katalog:** ein PR auf occulites `catalog/catalog.json` mit unserem Repository und dem Pfad zum Manifest.

## Tests

- **Go:** `go test ./...` und `go test -tags lite ./...` laufen beide in CI.
- **Fake-Lite:** Die XML-RPC-Seite der Fake-CCU bleibt, ReGa und WebUI fallen weg, dazu kommt eine
  nachgebaute Metadata-, Auth- und System-API. Alternativ läuft occulited selbst als Testgegenstelle
  (`go build ./cmd/occulited`, Metadaten per `PUT /api/meta/v1/import`), dann nur für die API ohne Funk.
- **E2E:** die Stack-Tests einmal gegen die Fake-CCU und einmal gegen die Fake-Lite. Der WebSocket-Mock
  bekommt eine Lite-Variante (`capabilities`), damit das Ausblenden in der App geprüft wird.
- **Echtes System:** vor dem ersten Release auf einer Lite-VM (OVA) die Checkliste aus Kapitel 12 des
  Howto durchgehen: Installation ohne Root, keine EROFS/EACCES-Fehler im Journal, Start/Stop, Update behält
  die Daten, Neustart, Deinstallation, Wiederherstellung eines OpenCCU-Backups.

## Schritte

Jeder Schritt ist ein eigener PR. Die ersten drei ändern nichts am Verhalten auf der CCU und lassen sich mit
den bestehenden Tests absichern.

1. **Backend-Schnittstelle.** Die Handler sprechen nicht mehr direkt mit `pkg/rega`, sondern mit
   `pkg/backend`. Nur die CCU-Umsetzung, gleiches Verhalten.
2. **Capabilities.** `auth_response` bekommt `platform` und `capabilities`, die App blendet danach aus. Auf
   der CCU ist alles an, es ändert sich also nichts Sichtbares.
3. **Eigene Daten pfadunabhängig.** Datenverzeichnis, PID-Datei und Log über die Konfiguration, damit Lite
   andere Pfade nutzen kann.
4. **Lite-Grundgerüst.** Build-Tag `lite`, Erkennung, Anmeldung über `X-Occulite-Session`, Paket mit
   Manifest für aarch64 und x86_64, Fake-Lite und CI für beide Varianten. Ergebnis: Das Add-on startet auf
   Lite und zeigt Geräte mit Namen.
5. **Bedienen auf Lite.** Räume, Gewerke, Favoriten und Namen aus der Metadata API, Werte aus `/state`,
   Schalten per `setValue`, Layouts in eigener Datei.
6. **Geräteverwaltung auf Lite.** Anlernen mit Posteingang, Umbenennen und Räume zuweisen, Löschen,
   Heizgruppen und Gerätefirmware über die System API.
7. **Servicemeldungen, Gesundheit, Push und Regeln** mit den Lite-Quellen.
8. **Hinweise statt Lücken.** Programme mit Link auf das Automations-Add-on, Systemseiten mit Link auf
   occulited, Selbst-Update ausgeblendet.
9. **Release und Katalog.** Test auf einer echten Lite-VM, Release mit Lite-Paketen und `.sha256`, PR in
   occulites Katalog.

## Offene Fragen an Sebastian

1. Sollen Layouts in unserer eigenen Datei liegen, oder gibt es einen Platz in der Metadata API für Daten
   pro Raum? Knoten haben bisher kein `meta`-Feld.
2. Teilen wir uns die Favoriten mit seiner Bedien-App über das `favorite`-Enum, oder lieber getrennt?
3. Ab welcher Stufe darf man Namen und Räume ändern? `meta-api.md` sagt Administrator, `system-api.md` sagt
   `configure`.
4. ~~Wie bestätigt man eine Servicemeldung auf Lite?~~ Geklärt aus occulites Doku: Die Meldungen sind nur
   lesbar; Sticky-Meldungen per `setValue` auf den Datenpunkt, die anderen enden von selbst.
5. Brauchen die HmIP-Anlernmethoden über die lokalen Ports eine besondere Freigabe, oder geht dort alles wie
   auf der CCU?
6. Wann rechnet er mit einer stabilen Version, und gibt es ein Testsystem (OVA oder LXC), das wir in CI
   nutzen können?
7. Darf ein Add-on, das sich als komplette Oberfläche versteht, Benutzer, Backup oder Neustart mit der
   Sitzung des angemeldeten Administrators aufrufen, oder soll das bei occulites eigenen Seiten bleiben?
   (Abschnitt *Weitere Module auf openccu-lite*)
8. Mit welchen IDs führt `/api/system/v1/groups` die Mitglieder einer Heizgruppe? Wir nehmen die
   Kanaladressen an, wie beim HMServer.

## Risiken

- **Lite ist noch in Entwicklung** (`dev.42`). Die Metadata API ist für Version 1 eingefroren, andere Teile
  können sich noch ändern. Deshalb erst die Schritte 1 bis 3, die auch ohne Lite etwas taugen.
- **Doppelte Pflege** bei Funktionen der Klasse B: Jede Änderung an Räumen, Namen oder Servicemeldungen
  braucht beide Umsetzungen. Die Schnittstelle und Tests für beide Varianten halten das im Rahmen.
- **Räume am Gerät:** occulited erlaubt Räume auch am Geräteobjekt. MUI zeigt sie an den Kanälen, solange
  ein Kanal keine eigenen hat; ändert man die Räume eines Kanals in MUI, werden sie seine eigenen
  (`meta.mui.ownEnums`). Ob occulites eigene Seiten das genauso sehen, ist nicht geprüft.
- **Neue Geräte ohne Namen** wirken auf Lite zunächst unfertig. Ein guter Vorschlag beim Anlernen (Typ und
  Raum) gleicht das aus.
