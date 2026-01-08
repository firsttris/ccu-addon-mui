# CCU3 MUI Go Server

Go implementation of the WebSocket server for the CCU3 MUI Add-on.

## Why Go?

| Feature | Node.js | Go |
|---------|---------|-----|
| Binary Size | 71 MB | 5-10 MB |
| RAM Usage | 30-50 MB | 5-15 MB |
| Dependencies | GLIBC 2.24+ | None (static) |
| Startup Time | 1-2 seconds | <100ms |
| Platform Support | Limited by GLIBC | Universal |

## Features

✅ **Identical functionality** to Node.js server:
- WebSocket server for client connections
- XML-RPC server for CCU event callbacks
- XML-RPC clients for BidCos-RF and HmIP-RF
- Rega script execution via HTTP
- Device-based channel subscriptions
- Event filtering and broadcasting
- Basic authentication support
- Node-RED compatibility (plain text Rega scripts)

## Building

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
- No Node.js runtime needed
- No GLIBC version requirements
- Runs on old Linux kernels (CCU3)

### Install to Addon
```bash
make install-addon
```

## Binary Size Comparison

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

## Configuration

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
| `RPC_SERVER_PORT` | 9099 | XML-RPC callback port |
| `CALLBACK_HOST` | 127.0.0.1 | Callback IP for CCU |
| `DEBUG` | false | Enable debug logging |

**Important for CALLBACK_HOST:**
- When running on the CCU3: Use `127.0.0.1`
- When running on a separate machine: Use the **actual IP** of that machine that the CCU3 can reach (e.g., `192.168.178.134`)

## Testing

### Quick Local Testing

Use the provided test script (make it executable first):
```bash
chmod +x test-local.sh
./test-local.sh
```

The script will:
- Load settings from `.env` file if present
- Build the local binary
- Start the server with test configuration

### Manual Testing

Run on your development machine:
```bash
CCU_HOST=192.168.178.111 DEBUG=true make run
```

## Deployment to CCU3

1. Build for ARM:
   ```bash
   make build-ccu3
   ```

2. Copy to CCU3:
   ```bash
   scp ccu-addon-mui-server-arm root@ccu3-ip:/usr/local/addons/mui/server/
   ```

3. Update rc.d script to use Go binary instead of Node.js

## Project Structure

```
go-server/
├── main.go                    # Entry point
├── pkg/
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

## Dependencies

- `github.com/gorilla/websocket` - WebSocket implementation
- `github.com/kolo/xmlrpc` - XML-RPC client/server

All dependencies are vendored into the static binary.

## Cross-Compilation

The Makefile uses these settings for CCU3:
```bash
GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0
```

- `GOARCH=arm GOARM=7`: ARMv7 (Cortex-A7 on CCU3)
- `CGO_ENABLED=0`: Pure Go, no C dependencies
- `-ldflags="-s -w"`: Strip debug info for smaller binary
- `-tags netgo`: Pure Go DNS resolver (no libc)

## Advantages for CCU3

1. **No Node.js dependency** - CCU3 has limited storage
2. **Works on old GLIBC** - CCU3 has Debian with GLIBC 2.24
3. **Smaller addon size** - Less download/install time
4. **Lower memory usage** - Important on embedded device
5. **Faster startup** - Better UX when addon starts
6. **Single binary** - No node_modules, no complications

## Performance

Expected resource usage on CCU3:
- **Memory**: ~8-12 MB (vs 40-60 MB Node.js)
- **CPU**: Negligible when idle
- **Startup**: <100ms (vs 1-2s Node.js)
