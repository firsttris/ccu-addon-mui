# WebSocket Server für CCU3 MUI Addon

## Übersicht

Der WebSocket-Server ersetzt den bisherigen Node-RED Flow und läuft als **standalone executable** (gebundelt mit Bun) auf der CCU3.

✨ **Keine Dependencies-Installation nötig!** Die Binary enthält alles.

## Features

- **WebSocket-Server** auf Port 8088
- **XML-RPC Integration** für BidCos-RF und HmIP-RF Geräte
- **Event-Handling** - empfängt und verteilt CCU-Events an alle verbundenen Clients
- **ReGa Script Execution** - führt Homematic-Scripts aus
- **Auto-Start** beim CCU3-Boot
- **🚀 Standalone Binary** - keine node_modules Installation auf der CCU3!

## Architektur

```
┌─────────────────┐
│   CCU3 Devices  │
│  (BidCos/HmIP)  │
└────────┬────────┘
         │ XML-RPC Events
         ▼
┌─────────────────┐
│  WebSocket      │◄───── WebSocket Clients (Browser)
│  Server         │
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

- `server/websocket-server.js` - Haupt-Server-Datei
- `server/package.json` - Node.js Dependencies
- `addon_installer/rc.d/mui` - Start/Stop Script für CCU3
- `addon_installer/update_script` - Installations-Script

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

Das Addon wird automatisch mit dem `update_script` installiert:

1. Frontend-Dateien werden nach `/usr/local/addons/mui` kopiert
2. **Standalone Binary** wird nach `/usr/local/addons/mui/server/websocket-server` kopiert
3. ~~Node.js Dependencies werden installiert~~ **Nicht mehr nötig!** 🎉
4. WebSocket-Server wird gestartet

## Build

Der Server wird mit **Bun** zu einer standalone executable gebundelt:

```bash
# Im Entwicklungs-Workspace
npm run build

# Dies führt aus:
# 1. nx build (Frontend)
# 2. cd server && bun install && bun run build (Server-Binary)
# 3. Kopiert alles nach addon_installer/
# 4. Erstellt .tar.gz Paket
```

Im `server/` Verzeichnis:
```bash
bun install
bun run build
# Erstellt: server/dist/websocket-server (standalone binary)
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

Im Frontend kannst du wie bisher `react-use-websocket` verwenden, aber mit der neuen URL:

```typescript
const { lastMessage, sendMessage } = useWebSocket('ws://ccu-hostname:8088');
```

## Vorteile gegenüber Node-RED

✅ Kleinerer Footprint  
✅ Direkte Integration ins Addon  
✅ Keine separate Node-RED Installation nötig  
✅ Einfachere Wartung  
✅ Schnellerer Start  
✅ **Keine Dependencies-Installation auf CCU3**  
✅ **Standalone Binary - alles in einer Datei**  

## Build-Technologie

Der Server wird mit **Bun** gebaut - dem modernsten und schnellsten JavaScript-Runtime:

- 🚀 Ultra-schneller Build
- 📦 Eingebautes `--compile` für standalone executables
- 🔋 Alle Dependencies in der Binary eingebettet
- 🎯 Kleinere Dateigrößen als pkg oder esbuild
- ⚡ Keine Runtime-Dependencies nötig

## Dependencies

**Zur Build-Zeit** (nur im Development):
- `ws` - WebSocket Server
- `homematic-xmlrpc` - XML-RPC Client für CCU
- `homematic-rega` - ReGa Script Execution

**Auf der CCU3**: Keine! Alles ist in der Binary gebundelt.
