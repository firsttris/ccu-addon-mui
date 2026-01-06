[English Version](README.en.md)

# CCU3 Add-on: Moderne Web-UI

Eine moderne, schnelle und responsive Progressive Web App (PWA) mit integriertem WebSocket-Server für Ihre CCU3.

# Funktionen

- **Moderne UI**: Responsives Design, optimiert für Tablets und mobile Geräte.
- **Geräteunterstützung**: Steuerung von Schaltern, Thermostaten, Jalousien, Türen und Fußbodenheizungen.
- **Echtzeit-Updates**: WebSocket-basierte Kommunikation für sofortige Gerätestatus-Updates.
- **PWA-Bereit**: Installierbar als native App auf Android- und iOS-Startbildschirmen.
- **WakeLock-Unterstützung**: Verhindert Bildschirm-Standby für kontinuierliche Steuerung.
- **Einfache Installation**: Einfache Add-on-Installation für CCU3-Systeme.

# Motivation

Meine Motivation war es, die bewährte CCU3 mit moderner Software aufzufrischen und ihr ein zeitgemäßes, responsives Interface zu verleihen.

![Screenshot](docs/tablet-screen.jpg)

# Technologie-Stack

Dieses Projekt wurde mit einem robusten Satz von Technologien entwickelt:

## Frontend

- [React](https://reactjs.org/): Eine JavaScript-Bibliothek zum Erstellen von Benutzeroberflächen.
- [TypeScript](https://www.typescriptlang.org/): Eine stark typisierte Obermenge von JavaScript, die statische Typen hinzufügt.
- [Emotion](https://emotion.sh/docs/introduction): Eine Bibliothek zum Schreiben von CSS-Stilen mit JavaScript.
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API): Zwei-Wege-Nachrichten zwischen Browser und Server.
- [Vite](https://vitejs.dev/): Nächste Generation Frontend-Tooling.
- [Nx](https://nx.dev/): Intelligentes, schnelles und erweiterbares Build-System.

## Backend

- [Bun](https://bun.sh/): Schnelle All-in-One JavaScript-Laufzeit und Bundler.
- [TypeScript](https://www.typescriptlang.org/): Typsichere Server-Code.
- [WebSocket Server](https://github.com/websockets/ws): WebSocket-Implementierung für Node.js.
- [Homematic Libraries](https://github.com/hobbyquaker): XML-RPC und ReGa-Script-Unterstützung.

# Voraussetzungen für CCU3

**Räume und/oder Gewerke konfigurieren und Kanäle (Geräte) zuweisen**

   Damit dieses Add-on ordnungsgemäß funktioniert, müssen Sie Räume oder Gewerke in Ihrer CCU3 konfiguriert haben. Jedem Raum sollten Kanäle mit geeigneten Namen zugewiesen sein, da das Add-on die Räume, ihre Kanäle und die Datenpunkte dieser Kanäle abfragt. Ohne diese Einrichtung funktioniert das Add-on nicht.

# Geräteunterstützung

Dieses Projekt unterstützt derzeit die folgenden Geräte:

### [Schalter](src/controls/SwitchControl.tsx)

**Kanaltyp:** `SWITCH_VIRTUAL_RECEIVER`

![Screenshot](docs/controls/switch.png)

**Funktionen:**

- Lichtstatus anzeigen
- Licht ein-/ausschalten

### [Thermostat](src/controls/ThermostatControl.tsx)

**Kanaltyp:** `HEATING_CLIMATECONTROL_TRANSCEIVER`

![Screenshot](docs/controls/thermostat.png)

**Funktionen:**

- Aktuelle Luftfeuchtigkeit anzeigen
- Zieltemperatur anzeigen
- Aktuelle Temperatur anzeigen
- Fenster-offen-Status anzeigen
- Zieltemperatur einstellen
- Zwischen manuellem und automatischem Modus wechseln
- Thermostat ausschalten
- Boost-Modus nur für Heizkörperthermostate

### [Jalousien](src/controls/BlindsControl.tsx)

**Kanaltyp:** `BLIND_VIRTUAL_RECEIVER`

![Screenshot](docs/controls/blinds.png)

**Funktionen:**

- Öffnungsprozentsatz anzeigen
- Öffnen/Schließen
- Stoppen
- Öffnungsprozentsatz der Jalousien durch Anklicken einstellen

_Damit dies ordnungsgemäß funktioniert, müssen Sie die Öffnungs- und Schließzeiten für Ihre Jalousien in der CCU3 messen und konfigurieren._

### [Türöffner](src/controls/DoorControl.tsx)

**Kanaltyp:** `KEYMATIC`

![Screenshot](docs/controls/door-operator.png)

**Funktionen:**

- Türstatus anzeigen
- Tür entriegeln
- Tür verriegeln
- Tür öffnen

### [Fußbodenheizung](src/controls/FloorControl.tsx)

**Kanaltyp:** `CLIMATECONTROL_FLOOR_TRANSCEIVER`

![Screenshot](docs/controls/floor-heating.png)

**Funktionen:**

- Öffnungsprozentsatz des Fußbodenheizungsventils anzeigen
- Zieltemperatur einstellen
- Aktuelle Temperatur anzeigen

# Benutzeroberfläche-Übersicht

Die aktuelle Benutzeroberfläche stellt eine responsive Version der Räume & Gewerke der CCU3 dar.

## Kanäle-Ansicht

Dies ist die Kanäle-Ansicht.  
Hier können Sie den Status der Kanäle sehen und ändern, die dem ausgewählten Raum zugeordnet sind.

![Screenshot](/docs/channel1.png)
![Screenshot](/docs/channel2.png)

# Installation

## So installieren Sie dieses Add-on:

1. Laden Sie die neueste Addon-`tar.gz`-Datei von der [Releases-Seite](https://github.com/firsttris/ccu-addon-mui/releases) herunter.
2. Installieren Sie es als Plugin auf Ihrer CCU3 über die Einstellungsseite unter "Zusätzliche Software".
3. Hinweis: Hochladen und Neustart dauern einige Zeit, abhängig von Ihrer CCU3-Box. (Zip-Datei ist groß, da sie die Node-Binärdatei enthält)
4. Das Add-on ist unter `http://192.168.178.123/addons/mui` verfügbar (ersetzen Sie mit Ihrer CCU-IP).

## Unsicheren CCU3-Ursprung als sicher einstellen

In der neuesten Chrome-Version funktionieren Progressive Web App (PWA)-Funktionen und WakeLock nur mit HTTPS.
Sie müssen die IP Ihrer CCU3 als sicheren Ursprung einrichten, damit es ohne HTTPS in Chrome funktioniert.

1. Öffnen Sie Chrome und gehen Sie zu `chrome://flags`.
2. Suchen Sie nach `Insecure origins treated as secure`
3. Geben Sie die IP-Adresse der CCU3 ein, z.B. `http://192.168.178.111` (ersetzen Sie mit Ihrer IP).
4. Aktivieren
5. Speichern und Chrome neu starten

## Die PWA zum Startbildschirm hinzufügen

Progressive Web Apps (PWAs) können auf Ihrem Gerät wie native Apps installiert werden. Befolgen Sie diese Schritte, um unsere PWA zu Ihrem Startbildschirm hinzuzufügen:

### Auf Android:

1. Öffnen Sie die PWA in Ihrem Browser (z.B. Chrome, Firefox).
2. Tippen Sie auf das Browser-Menü (normalerweise drei Punkte in der oberen rechten Ecke).
3. Wählen Sie "Zum Startbildschirm hinzufügen".

### Auf iOS:

1. Öffnen Sie die PWA in Safari.
2. Tippen Sie auf die Teilen-Schaltfläche (das Kästchen mit einem nach oben gerichteten Pfeil).
3. Scrollen Sie nach unten und wählen Sie "Zum Startbildschirm hinzufügen".

Nach diesen Schritten erscheint die PWA als Symbol auf Ihrem Startbildschirm, und Sie können sie wie eine native App verwenden.

## WakeLock verwenden, um Bildschirm-Standby zu verhindern

Um zu verhindern, dass die PWA in den Standby-Modus geht, verwenden wir die [WakeLock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

Schritte zur Aktivierung der experimentellen WakeLock-API in Chrome:

HINWEIS: Die WakeLock-API ist möglicherweise nicht mehr experimentell, wenn Sie dies lesen.

1. Öffnen Sie Chrome und gehen Sie zu `chrome://flags`.
2. Suchen Sie nach und aktivieren Sie `Experimental Web Platform features`.
3. Speichern und Chrome neu starten.

Nach diesen Schritten sollte die WakeLock-API aktiviert sein, wodurch verhindert wird, dass Ihr Bildschirm in den Standby-Modus geht, während Sie die PWA verwenden.

Um zu überprüfen, ob WakeLock funktioniert, prüfen Sie die Browser-Konsole auf den folgenden Fehler:
![Screenshot](docs/WakeLock_error.png)
Dieser Fehler zeigt an, dass die WakeLock-API nicht verfügbar ist; überprüfen Sie die oben genannten Schritte.

# Entwicklung und Build

## Voraussetzungen

Um dieses Projekt zu bauen, benötigen Sie:

- **[Node.js](https://nodejs.org/)** (v18 oder höher) - für npm und Build-Tools
- **[Bun](https://bun.sh/)** (neueste Version) - für das Bündeln des WebSocket-Servers
  ```bash
  # Bun installieren
  curl -fsSL https://bun.sh/install | bash
  ```

## Einrichtung

Um dieses Projekt zu entwickeln und zu bauen, folgen Sie diesen Schritten:

1. Repository klonen: `git clone https://github.com/firsttris/ccu-addon-mui.git`
2. In das Projektverzeichnis navigieren: `cd ccu-addon-mui`
3. Abhängigkeiten installieren: `npm install`
4. Ihre CCU3-IP in [proxy.config.json](proxy.config.json) setzen
5. Entwicklungsserver starten: `npm start`
6. Um das Projekt zu bauen, verwenden Sie: `npm run build`

Dies wird:
- Die Frontend React-App bauen
- Den WebSocket-Server mit allen Abhängigkeiten bündeln
- Die Node.js ARM32-Binärdatei für CCU3 herunterladen
- Ein `.tar.gz` Addon-Paket erstellen, das zur Installation bereit ist

## WebSocket-Test

Um Ihre WebSocket-Verbindung zu testen, können Sie das [WebSocket Test Client](https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn) Chrome-Addon verwenden:

1. Öffnen Sie den WebSocket Test Client und gehen Sie zu "Options".
2. Geben Sie Ihre WebSocket-Endpunkt-URL ein: `ws://192.168.178.111/addons/red/ws/webapp` (ersetzen Sie mit Ihrer tatsächlichen IP).
3. Drücken Sie "Connect". (Status "OPEN" zeigt eine erfolgreiche Verbindung an.)
4. Testen Sie die Verbindung, indem Sie den Inhalt des [getRooms.tcl](src/rega/getRooms.tcl) Skripts als Payload senden.

## Homematic API-Zusammenfassung

Ich habe eine API-Zusammenfassung gesammelt, wo Sie einen schnellen Überblick über alle Methoden für die verschiedenen Homematic-APIs haben

[API-Zusammenfassung](/docs/api/README.md)

# Probleme

Möchten Sie zu diesem Projekt beitragen?

Besuchen Sie bitte unsere [Issues-Seite](https://github.com/firsttris/ccu-addon-mui/issues) für die neuesten Issues und Feature-Anfragen.

# Beiträge

Wir freuen uns über Pull-Requests, um Funktionen oder Unterstützung für neue Geräte hinzuzufügen. Ihre Beiträge werden geschätzt!

# Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE)-Datei für Details.