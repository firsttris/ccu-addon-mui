# WebSocket Server für CCU3 MUI Addon

## Übersicht

Der WebSocket-Server ersetzt den bisherigen Node-RED Flow und läuft als optimierter Service auf der CCU3.

## Features

- **WebSocket-Server** auf Port 8088 (via lighttpd Proxy: `/ws/mui`)
- **XML-RPC Integration** für BidCos-RF und HmIP-RF Geräte
- **Event-Handling** - empfängt und verteilt CCU-Events an alle verbundenen Clients
- **ReGa Script Execution** - führt Homematic-Scripts aus
- **Auto-Start** beim CCU3-Boot
- **TypeScript** - Type-safe Development
- **Bun Build** - Optimierter Bundle-Prozess
- **Minimal Dependencies** - Nur 3 native Module (ws, homematic-xmlrpc, homematic-rega)

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
└────────┬────────┘
         │ ReGa Scripts
         ▼
┌─────────────────┐
│   CCU3 ReGa     │
│   (Port 8181)   │
└─────────────────┘
```

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
3. **Dependencies installieren**: `npm install --production` (nur 3 Packages: ws, homematic-xmlrpc, homematic-rega)
4. WebSocket-Server wird gestartet

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

## Vorteile gegenüber Node-RED

✅ Kleinerer Footprint (2.7 KB Bundle statt kompletter Node-RED Installation)  
✅ Direkte Integration ins Addon  
✅ Keine separate Node-RED Installation nötig  
✅ Einfachere Wartung  
✅ Schnellerer Start  
✅ **Type-Safety durch TypeScript**  
✅ **Optimierter Bundle-Prozess mit Bun**  
✅ **Minimal Dependencies** (nur 3 Packages)  
✅ **Architektur-unabhängig** - funktioniert auf ARM (CCU3) und x86-64

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

**Auf der CCU3**: Keine! Alles ist in der Binary gebundelt.
