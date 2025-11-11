# WebSocket Server für CCU3 MUI Addon

## Übersicht

Der WebSocket-Server ersetzt den bisherigen Node-RED Flow und läuft als optimierter Service auf der CCU3.

## Features

- **WebSocket-Server** auf Port 8088 (via lighttpd Proxy: `/ws/mui`)
- **XML-RPC Integration** für BidCos-RF und HmIP-RF Geräte
- **Event-Handling** - empfängt und verteilt CCU-Events an alle verbundenen Clients
- **ReGa Script Execution** - führt Homematic-Scripts aus
- **TypeScript** - Type-safe Development
- **Bun Build** - Optimierter Bundle-Prozess

## Architektur

```
┌─────────────────┐
│   CCU3 Devices  │
│  (BidCos/HmIP)  │
└────────┬────────┘
         │ XML-RPC Events
         ▼
┌─────────────────┐
│  WebSocket      │◄──── Lighttpd Proxy (/ws/mui)
│  Server         │      ◄──── WebSocket Clients (Browser)
│  (Port 8088)    │
│                 │
│  RPC Server     │◄──── CCU sendet Events hierher
│  (Port 9099)    │      (via CALLBACK_HOST)
└────────┬────────┘
         │ ReGa Scripts
         ▼
┌─────────────────┐
│   CCU3 ReGa     │
│  (Port 8183)    │ Local: 8183 (no auth), Remote: 8181 (with auth)
└─────────────────┘
```

### Event-Flow

1. **CCU Gerät ändert Status** (z.B. Schalter wird betätigt)
2. **CCU XML-RPC Interface** (BidCos-RF/HmIP-RF) sendet Event an `http://CALLBACK_HOST:9099`
3. **WebSocket Server** empfängt Event und broadcastet an alle verbundenen Browser
4. **Browser** empfängt Event und aktualisiert UI

## Dateien

- `server/websocket-server.ts` - TypeScript Source (Development)
- `server/dist/websocket-server.js` - Gebundeltes Bundle (Production)
- `server/package.json` - Dependencies
- `server/types.d.ts` - Type Definitions für Homematic Libraries
- `addon_installer/rc.d/mui` - Start/Stop Script für CCU3
- `addon_installer/update_script` - Installations-Script
- `addon_installer/lighttpd.conf` - WebSocket Proxy Config

## WebSocket-Protokoll

### Events von CCU → Client

```json
{
  "event": {
    "interface": "HmIP-RF",
    "channel": "000A18A994DB7C:1",
    "datapoint": "STATE",
    "value": true,
    "timestamp": "2025-11-09T10:30:00.000Z"
  }
}
```

### Script ausführen (Client → Server)

```json
{
  "type": "script",
  "script": "dom.GetObject('BidCos-RF.000A18A994DB7C:1').State()",
  "requestId": "unique-id"
}
```

### Wert setzen (Client → Server)

```json
{
  "type": "setValue",
  "address": "000A18A994DB7C:1",
  "datapoint": "STATE",
  "value": true,
  "requestId": "unique-id"
}
```

### Antwort (Server → Client)

```json
{
  "type": "script_response",
  "result": {...},
  "requestId": "unique-id"
}
```

## Installation

## Installation

Das Addon wird automatisch mit dem `update_script` installiert:

1. Frontend-Dateien werden nach `/usr/local/addons/mui` kopiert
2. **Server-Bundle** (`websocket-server.js` + `package.json`) wird nach `/usr/local/addons/mui/server/` kopiert
3. **VERSION Datei** wird kopiert (für Update-Check in CCU UI)
4. **Dependencies installieren**: `npm install --production` (nur 3 Packages: ws, homematic-xmlrpc, homematic-rega)
5. **lighttpd konfigurieren** und neu laden
6. **WebSocket-Server starten** via rc.d Script

## Umgebungsvariablen

Der Server kann über Umgebungsvariablen konfiguriert werden:

| Variable | Beschreibung | Default | Beispiel |
|----------|--------------|---------|----------|
| `CCU_HOST` | IP/Hostname der CCU | `localhost` | `192.168.178.26` |
| `CCU_USER` | CCU Username für ReGa (optional bei localhost) | - | `Admin` |
| `CCU_PASS` | CCU Passwort für ReGa (optional bei localhost) | - | `yourpassword` |
| `CALLBACK_HOST` | IP wo DIESER Server läuft und CCU ihn erreichen kann | `127.0.0.1` | `192.168.178.134` |

### Wichtig: CALLBACK_HOST

- **Auf der CCU selbst**: `CALLBACK_HOST=127.0.0.1` (Standard)
- **Lokale Entwicklung**: `CALLBACK_HOST=<Ihre-Dev-Machine-IP>` (z.B. `192.168.178.134`)

Die CCU muss den RPC-Server (Port 9099) unter dieser Adresse erreichen können, um Events zu senden!

### Beispiel .env für lokale Entwicklung:

```env
CCU_HOST=192.168.178.26
CCU_USER=Admin
CCU_PASS=yourpassword
CALLBACK_HOST=192.168.178.134
```

### Beispiel für Produktion (auf CCU):

```env
# CCU_HOST=localhost (default, kann weggelassen werden)
# CALLBACK_HOST=127.0.0.1 (default, kann weggelassen werden)
```

## Build

Der Server wird mit **Bun** zu einem optimierten Node.js-Bundle gebaut:

```bash
# Im Entwicklungs-Workspace (Root)
npm run build

# Dies führt aus:
# 1. nx build server (Bun Bundle)
# 2. nx build ccu-addon-mui (Frontend)
# 3. npm run postbuild (Paketierung)
```

Im `server/` Verzeichnis:

```bash
bun install
bun run build
# Erstellt: server/dist/websocket-server.js (optimierter Bundle)
```

**Build-Konfiguration:**

```json
{
  "build": "bun build --target=node --minify --sourcemap --external ws --external homematic-xmlrpc --external homematic-rega ./websocket-server.ts --outdir dist"
}
```

## Verwaltung

Der Server wird über das rc.d Script verwaltet:

```bash
# Start
/usr/local/etc/config/rc.d/mui start

# Stop
/usr/local/etc/config/rc.d/mui stop

# Restart
/usr/local/etc/config/rc.d/mui restart

# Deinstallation
/usr/local/etc/config/rc.d/mui uninstall
```

## Testing over SSH

Während der Entwicklung kann der Server-Code schnell auf die CCU übertragen und getestet werden:

### SSH-Verbindung zur CCU

```bash
ssh root@192.168.178.26
```

### Server-Bundle auf CCU kopieren

```bash
scp server/dist/websocket-server.js root@192.168.178.26:/tmp/
```

### Option 1: Server manuell testen (temporär)

```bash
# Finde den laufenden Prozess
ps aux | grep websocket-server

# Stoppe ihn (ersetze <PID> mit der Prozess-ID)
kill <PID>

# Starte den Server direkt mit node
/usr/local/addons/mui/node/bin/node /tmp/websocket-server.js
```

### Option 2: Server im Addon ersetzen und über rc.d neustarten

```bash
# Server-Bundle ins Addon-Verzeichnis kopieren
scp server/dist/websocket-server.js root@192.168.178.26:/usr/local/addons/mui/server/

# Via SSH auf der CCU: Server über rc.d neustarten
ssh root@192.168.178.26
/usr/local/etc/config/rc.d/mui restart

# Logs prüfen
tail -f /var/log/mui-websocket-server.log
```

## Konfiguration

### Entwicklung (lokal)

Für die Entwicklung von außerhalb der CCU nutze eine `.env` Datei:

```env
CCU_HOST=192.168.178.26
CCU_USER=Admin
CCU_PASS=your-password
```

Der Server nutzt dann:
- Port **8181** für Rega (mit Authentifizierung)
- Externe CCU-Adresse

### Production (auf CCU installiert)

Auf der CCU werden **keine** Umgebungsvariablen benötigt:
- Automatisch `localhost` als Host
- Port **8183** für Rega (keine Authentifizierung nötig für lokale Verbindungen)
- Keine Credentials erforderlich

## Logs

Logs werden in `/var/log/mui-websocket-server.log` geschrieben.

## Client-Integration

Im Frontend wird automatisch die richtige WebSocket-URL verwendet:

```typescript
// Dynamische URL basierend auf window.location
const wsUrl =
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws/mui`
    : `ws://${window.location.host}/ws/mui`;

const { lastMessage, sendMessage } = useWebSocket(wsUrl);
```

**Lighttpd Proxy:**

- Browser verbindet zu `/ws/mui`
- Lighttpd proxied zu `localhost:8088`
- Funktioniert mit HTTP und HTTPS (WSS)

## Build-Technologie

Der Server nutzt **Bun** für den Build-Prozess:

- 🚀 Ultra-schneller Build (10x schneller als npm/webpack)
- 📦 Native TypeScript-Unterstützung (kein ts-node nötig)
- 🔋 Optimierter Bundle mit Minification
- 🎯 Native Module bleiben extern (--external Flags)
- ⚡ Entwicklung: `bun websocket-server.ts` läuft direkt
- 🏗️ Production: Optimiertes Bundle für Node.js auf CCU3 (ARM)

## Dependencies

**Development** (beim Entwickeln):

- `ws` - WebSocket Server
- `homematic-xmlrpc` - XML-RPC Client für CCU
- `homematic-rega` - ReGa Script Execution
- `@types/*` - TypeScript Definitionen

**Production** (auf der CCU3):

- Nur die 3 Runtime-Dependencies (`ws`, `homematic-xmlrpc`, `homematic-rega`)
- Installiert via `npm install --production` während Addon-Installation
