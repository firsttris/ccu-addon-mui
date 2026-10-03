<div align="center">

# CCU3 MUI Go Server

[![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://golang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](../LICENSE)

**High-performance, static WebSocket server implementation for the CCU3 MUI Add-on.**

</div>

---

## ⚡ Why Go?

| Feature | Node.js | Go |
|---------|---------|-----|
| **Binary Size** | 71 MB | **5-10 MB** |
| **RAM Usage** | 30-50 MB | **5-15 MB** |
| **Dependencies** | GLIBC 2.24+ | **None (static)** |
| **Startup Time** | 1-2 seconds | **<100ms** |
| **Platform Support** | Limited by GLIBC | **Universal** |

## 🏗️ Building

### Local Development
```bash
make build
make run
```

### For CCU3 (ARMv7)
```bash
make build-ccu3
```

This creates a **statically linked** binary with no dependencies:
- ✅ No Node.js runtime needed
- ✅ No GLIBC version requirements
- ✅ Runs on old Linux kernels (CCU3)

### Install to Addon
```bash
make install-addon
```

## 📦 Binary Size Comparison

```bash
make size
```

Expected output:
```
Binary sizes:
ccu-addon-mui-server 8.5M     (local)
ccu-addon-mui-server-arm 7.2M (CCU3)
```

Compare to Node.js: **71 MB** → **~90% smaller!**

## ⚙️ Configuration

### Using .env File

Create a `.env` file in the `go-server` directory:

```bash
cp .env.example .env
```

Edit `.env` with your CCU3 settings:

```bash
CCU_HOST=192.168.178.26      # Your CCU3 IP
CCU_USER=Admin                # Optional: CCU username
CCU_PASS=your-password        # Optional: CCU password
CALLBACK_HOST=192.168.178.134 # IP where CCU can reach this server
DEBUG=false                   # Enable debug logging
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CCU_HOST` | localhost | CCU hostname/IP |
| `CCU_USER` | - | Basic auth username |
| `CCU_PASS` | - | Basic auth password |
| `WS_PORT` | 8088 | WebSocket server port |
| `REGA_PORT` | 8181 (8183 for `localhost`) | ReGa script port |
| `RPC_PORT` | 2001 | BidCos-RF XML-RPC port of the CCU |
| `HMIP_PORT` | 2010 | HmIP-RF XML-RPC port of the CCU |
| `VIRTUAL_DEVICES_PORT` | 9292 | VirtualDevices (heating groups) XML-RPC port of the CCU |
| `AUTH_MODE` | ccu | `ccu`: log in once per device with a CCU WebUI user; `none`: no login (everyone on the network can control all devices) |
| `CCU_WEBUI_URL` | http://`CCU_HOST` | CCU WebUI whose JSON-RPC API (`/api/homematic.cgi`) verifies logins |
| `AUDIT_LOG_FILE` | /usr/local/etc/config/mui-audit.log (CCU), ./mui-audit.log (local) | Every change made through the add-on (user, time, target, old and new value, result) as JSON lines; rotated at 512 KB, the previous file is kept as `.1`. Empty disables it |
| `SESSIONS_FILE` | /usr/local/etc/config/mui-sessions.json (CCU), ./mui-sessions.json (local) | Logged-in devices; every token belongs to one, so a single device can be logged out |
| `AUTH_KEY_FILE` | /usr/local/etc/config/mui-auth.key (CCU), ./mui-auth.key (local) | Key that signs the login tokens; created on first start. Deleting it logs out all devices |
| `WS_BIND_HOST` | 127.0.0.1 | Address the WebSocket server listens on (lighttpd proxies to it; use `0.0.0.0` to expose it directly) |
| `RPC_SERVER_PORT` | 9099 | XML-RPC callback port |
| `CALLBACK_HOST` | 127.0.0.1 | Callback IP for CCU |
| `DEBUG` | false | Enable debug logging |

> [!IMPORTANT]
> **CALLBACK_HOST**:
> - When running on the CCU3: Use `127.0.0.1`
> - When running on a separate machine: Use the **actual IP** of that machine (e.g., `192.168.178.134`)

On the CCU, settings go into `/usr/local/etc/config/mui.conf` (e.g. `AUTH_MODE=none`), which the rc.d script loads on start. It is kept across add-on updates and, unlike the add-on directory, not served to the web.

## 🔌 WebSocket Protocol

`protocol/schema.json` (JSON Schema) describes every request, response and event exactly. The app's TypeScript types are generated from it (`npm run generate:protocol`), and `integration_test.go` checks every message the server sends in the tests against it, so a change on either side that breaks the other fails CI.

All messages are JSON objects with a `type`. Every request may carry a `requestId`, which is echoed in its response or error. With `AUTH_MODE=ccu`, a connection must log in (`login`) or present a stored token (`auth`) first; everything else is answered with `{"type": "error", "code": "AUTH_REQUIRED"}`.

| Request | Response |
|---------|----------|
| `{"type": "auth", "token": "…", "adminToken": "…"}` | `{"type": "auth_response", "success", "authRequired", "user", "level", "token", "elevated"}`: the token is renewed, store the new one. `level` is the CCU user level (`admin`, `user`, `guest`, empty if unknown) |
| `{"type": "login", "username", "password"}` | `auth_response` with a token (valid for a year, for operating; administrators also get an `adminToken` for 8 hours) or a `code`: `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `CCU_UNREACHABLE` |
| `{"type": "getRooms", "deviceId"}` | `{"deviceId", "rooms": [{"id", "name"}]}` |
| `{"type": "getTrades", "deviceId"}` | `{"deviceId", "trades": [{"id", "name"}]}` |
| `{"type": "getChannels", "deviceId", "roomId" \| "tradeId" \| "all": true}` | `{"deviceId", "roomId" \| "tradeId" \| "all", "channels": [{"id", "address", "name", "type", "interfaceName", "datapoints", "statusAddress", "status": {"LOW_BAT", "UNREACH"}, "rooms", "trades"}]}` |
| `{"type": "subscribe", "deviceId", "channels": ["<address>"]}` | `subscribe_response`; then `{"event": {"channel", "datapoint", "value"}}` for these channels |
| `{"type": "setDatapoint", "requestId", "interfaceName", "address", "attribute", "value"}` | `{"type": "setDatapoint_response", "requestId", "success", "code"}`; `code` is `UNREACH` (not sent), `FORBIDDEN` (guest user), `NOT_FOUND`, `INVALID_REQUEST` or `CCU_ERROR` |
| `{"type": "getDeviceProblems"}` | `{"type": "deviceProblems", "devices": [{"address", "name", "roomId", "roomName", "lowBat", "unreach"}]}` |
| `{"type": "getParamsetDescription", "interfaceName", "address", "paramsetKey": "VALUES" \| "MASTER"}` | `{"type": "paramsetDescription", "address", "paramsetKey", "description": {"<PARAM>": {"type", "operations", "flags", "min", "max", "default", "unit", "valueList", "special"}}}` (cached per device type and firmware) |
| `{"type": "getParamset", "interfaceName", "address", "paramsetKey"}` | `{"type": "paramset", "address", "paramsetKey", "values"}` |
| `{"type": "putParamset", "interfaceName", "address", "paramsetKey": "MASTER", "values"}` | `{"type": "putParamset_response", "success"}` or an error with `code` `FORBIDDEN` (not an administrator), `ELEVATION_REQUIRED` (password needed again), `INVALID_VALUE` (checked against the description), `CCU_ERROR`. Recorded in the audit log |
| `{"type": "elevate", "password"}` | `{"type": "elevate_response", "success", "adminToken"}`: administrators get a token for changing settings, valid for 8 hours; pass it as `adminToken` in `auth` after a reconnect |
| `{"type": "listDevices"}` | `{"type": "devices", "devices": [{"interfaceName", "address", "name", "type", "firmware", "children", "paramsets", "channels": [{"address", "type", "index", "linkSourceRoles", "linkTargetRoles"}]}]}` |
| `{"type": "rename", "address", "name"}` | `{"type": "rename_response", "success"}`: renames a device or channel (administrators with admin token; audited) |
| `{"type": "setGroupMember", "groupId", "channelId", "member"}` | `{"type": "setGroupMember_response", "success"}`: adds a channel to a room or trade, or removes it |
| `{"type": "setInstallMode", "interfaceName", "on", "seconds"}` | `{"type": "setInstallMode_response", "success"}`: starts or stops pairing |
| `{"type": "getInstallMode", "interfaceName"}` | `{"type": "getInstallMode_response", "seconds"}`: seconds left, 0 when off |
| `{"type": "getInbox"}` | `{"type": "getInbox_response", "devices": [{"address", "type", "interfaceName", "name"}]}`: paired devices not yet accepted |
| `{"type": "acceptDevice", "address"}` | `{"type": "acceptDevice_response", "success"}`: takes a device out of the inbox (sets `ReadyConfig`; to be verified on real hardware) |
| `{"type": "deleteDevice", "interfaceName", "address", "reset", "force"}` | `{"type": "deleteDevice_response", "success"}` |
| `{"type": "getLinks", "interfaceName", "address"}` | `{"type": "getLinks_response", "links": [{"sender", "receiver", "name"}]}`: direct links of a device or channel (administrators) |
| `{"type": "addLink", "interfaceName", "sender", "receiver", "name"}`, `{"type": "removeLink", "interfaceName", "sender", "receiver"}` | `{"type": "addLink_response" \| "removeLink_response", "success"}` (administrators with admin token; audited) |
| `{"type": "getLinkParamsetDescription" \| "getLinkParamset", "interfaceName", "address", "partner"}` | `description` or `values` of a link on the side of `address` |
| `{"type": "putLinkParamset", "interfaceName", "address", "partner", "values"}` | `{"type": "putLinkParamset_response", "success"}`; values are checked against the description |
| `{"type": "logout"}` | `{"type": "logout_response", "success"}`: revokes the token of this device |
| `{"type": "listSessions"}` | `{"type": "listSessions_response", "sessions": [{"id", "user", "device", "created", "lastUsed", "current"}]}` (administrators with admin token) |
| `{"type": "revokeSession", "id"}` | `{"type": "revokeSession_response", "success"}`: logs a device out; its open connections are closed |
| `{"type": "getSysvars"}` | `{"type": "getSysvars_response", "sysvars": [{"id", "name", "visible", "kind", "unit", "min", "max", "value", "falseName", "trueName", "valueList"}]}`; `kind` is `bool`, `alarm`, `number`, `enum` or `string` |
| `{"type": "setSysvar", "id", "value"}` | `{"type": "setSysvar_response", "success"}` (not for guests; audited) |
| `{"type": "getPrograms"}` | `{"type": "getPrograms_response", "programs": [{"id", "name", "active", "visible"}]}` |
| `{"type": "runProgram", "id"}` | `{"type": "runProgram_response", "success"}` (not for guests) |
| `{"type": "setProgramActive", "id", "active"}` | `{"type": "setProgramActive_response", "success"}` (administrators with admin token) |

## 🧪 Testing

### Quick Local Testing

To run the server together with the frontend, use `npm run dev` in the repository root (loads `go-server/.env`).

To run only the server:

Use the provided test script (make it executable first):
```bash
chmod +x test-local.sh
./test-local.sh
```

The script will:
1. Load settings from `.env` file if present
2. Build the local binary
3. Start the server with test configuration

### Fake CCU

`pkg/fakeccu` plays the CCU from a JSON fixture: it answers the add-on's ReGa scripts, the XML-RPC interfaces and the WebUI login, takes writes in memory and sends events back like the real CCU. `integration_test.go` runs the whole server against it; you can also develop without hardware:

```bash
npm run dev:fake   # fake CCU + server + frontend, log in with Admin / secret
```

`fixtures/demo-ccu.json` is a small hand-written fixture. To create one from your own CCU (read only; names can be anonymized):

```bash
cd go-server
CCU_HOST=192.168.178.26 go run ./cmd/ccu-export -o ../fixtures/my-ccu.json -anonymize
```

### Manual Testing

Run on your development machine:
```bash
CCU_HOST=192.168.178.111 DEBUG=true make run
```

## 🚀 Deployment to CCU3

Normally the server is part of the add-on: `npm run build` in the repository root creates the installable `mui-<version>.tar.gz`.

To replace only the server binary on a CCU with the add-on installed:

1. **Build for ARM**:
    ```bash
    make build-ccu3
    ```

2. **Copy to CCU3 and restart**:
    ```bash
    scp ccu-addon-mui-server-arm root@ccu3-ip:/usr/local/addons/mui/go-server/ccu-addon-mui-server
    ssh root@ccu3-ip /usr/local/etc/config/rc.d/mui restart
    ```

## 📂 Project Structure

```
go-server/
├── main.go                    # Entry point
├── pkg/
│   ├── auth/                 # Login with CCU users, tokens
│   ├── config/               # Configuration
│   ├── logger/               # Logging
│   ├── types/                # Type definitions
│   ├── subscriptions/        # Device subscription manager
│   ├── rega/                 # Rega HTTP client
│   ├── websocket/            # WebSocket server
│   └── xmlrpc/               # XML-RPC server & clients
├── Makefile                   # Build automation
├── go.mod                     # Go dependencies
└── README.md                  # This file
```

## 🧩 Dependencies

- `github.com/gorilla/websocket` - WebSocket implementation
- `github.com/kolo/xmlrpc` - XML-RPC client
- `github.com/rogpeppe/go-charset` - ISO-8859-1 support for XML-RPC callbacks
- `golang.org/x/text` - ISO-8859-1 decoding of ReGa responses

*All dependencies are compiled into the static binary.*

## 🛠️ Cross-Compilation

The Makefile uses these settings for CCU3:
```bash
GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0
```

- `GOARCH=arm GOARM=7`: ARMv7 (Cortex-A7 on CCU3)
- `CGO_ENABLED=0`: Pure Go, no C dependencies
- `-ldflags="-s -w"`: Strip debug info for smaller binary
- `-tags netgo`: Pure Go DNS resolver (no libc)

## ✨ Advantages for CCU3

1. **No Node.js dependency** - CCU3 has limited storage
2. **Works on old GLIBC** - CCU3 has Debian with GLIBC 2.24
3. **Smaller addon size** - Less download/install time
4. **Lower memory usage** - Important on embedded device
5. **Faster startup** - Better UX when addon starts
6. **Single binary** - No node_modules, no complications

## 📈 Performance

Expected resource usage on CCU3:
- **Memory**: ~8-12 MB (vs 40-60 MB Node.js)
- **CPU**: Negligible when idle
- **Startup**: <100ms (vs 1-2s Node.js)
