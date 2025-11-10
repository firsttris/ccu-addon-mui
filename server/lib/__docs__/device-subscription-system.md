# Device-Based Event Subscription System

## 🎯 Konzept

Jedes Device (Browser/Tablet/Handy) hat eine **eindeutige DeviceID** und subscribed nur für die Channels, die es gerade anzeigt. Events werden nur an Devices gesendet, die den entsprechenden Channel subscribed haben.

## 🔄 Flow

### 1. Device startet
```
Browser öffnet → useUniqueDeviceID() → "id-abc123"
                  (gespeichert in localStorage)
```

### 2. Device lädt Channels für einen Raum
```tsx
// User navigiert zu "Wohnzimmer"
getChannelsForRoomId(1)
  ↓
channels: [
  { address: "CH1", ... },
  { address: "CH2", ... },
  { address: "CH3", ... }
]
```

### 3. Auto-Subscribe (useEffect)
```tsx
useEffect(() => {
  if (channels.length > 0) {
    sendMessage({
      type: 'subscribe',
      deviceId: 'id-abc123',
      channels: ['CH1', 'CH2', 'CH3']
    });
  }
}, [channels]);
```

### 4. Backend registriert Subscription
```typescript
// DeviceSubscriptionManager
subscriptions.set('id-abc123', Set(['CH1', 'CH2', 'CH3']))
```

### 5. CCU sendet Event
```
CCU: CH1:STATE = true
  ↓
Backend prüft für jedes Device:
  - Device "id-abc123": Hat CH1 subscribed? ✅ → Event senden
  - Device "id-xyz789": Hat CH1 subscribed? ❌ → Event filtern
```

## 📊 Multi-Device Szenario

**Tablet (Wohnzimmer)**: deviceId = "id-abc123"
- Subscribed: [CH1, CH2, CH3]

**Handy (Küche)**: deviceId = "id-xyz789"  
- Subscribed: [CH4, CH5]

**Desktop (Alle Räume)**: deviceId = "id-def456"
- Nicht subscribed = empfängt ALLE Events

### Event Flow

| CCU Event | Tablet (abc123) | Handy (xyz789) | Desktop (def456) |
|-----------|-----------------|----------------|------------------|
| CH1:STATE=true | ✅ Empfängt | ❌ Gefiltert | ✅ Empfängt |
| CH4:TEMP=22 | ❌ Gefiltert | ✅ Empfängt | ✅ Empfängt |
| CH6:LEVEL=50 | ❌ Gefiltert | ❌ Gefiltert | ✅ Empfängt |

## 🔧 Implementierung

### Backend (server/lib/device-subscriptions.ts)

```typescript
class DeviceSubscriptionManager {
  private subscriptions = new Map<string, Set<string>>();
  
  subscribe(deviceId: string, channels: string[]): void
  shouldReceiveEvent(deviceId: string, event: CCUEvent): boolean
  unsubscribe(deviceId: string): void
}
```

### Backend (server/lib/websocket.ts)

```typescript
const clientDeviceIds = new Map<WebSocket, string>();
const subscriptionManager = createDeviceSubscriptionManager();

broadcastToClients(event) {
  clients.forEach(client => {
    const deviceId = clientDeviceIds.get(client);
    if (deviceId && !subscriptionManager.shouldReceiveEvent(deviceId, event)) {
      return; // Filter event
    }
    client.send(event);
  });
}
```

### Frontend (src/hooks/useWebsocket.tsx)

```tsx
const deviceId = useUniqueDeviceID();

useEffect(() => {
  if (channels.length > 0) {
    sendMessage({
      type: 'subscribe',
      deviceId,
      channels: channels.map(c => c.address)
    });
  }
}, [channels, deviceId]);
```

## ✨ Vorteile

✅ **Performance**: Jedes Device empfängt nur relevante Events  
✅ **Bandwidth**: Weniger Netzwerk-Traffic  
✅ **Skalierbar**: Auch mit vielen Devices effizient  
✅ **Auto-Cleanup**: Subscription wird bei Disconnect gelöscht  
✅ **DeviceID-basiert**: Jedes Device unabhängig  
✅ **Backward Compatible**: Devices ohne Subscribe empfangen alle Events  

## 🔄 Re-Subscribe bei Navigation

```
User: Wohnzimmer → Küche
  ↓
channels ändern sich
  ↓
useEffect triggered
  ↓
Neues Subscribe mit neuen Channels
  ↓
Backend updated Subscription für diese DeviceID
```

## 🧹 Cleanup

```typescript
ws.on('close', () => {
  const deviceId = clientDeviceIds.get(ws);
  if (deviceId) {
    subscriptionManager.unsubscribe(deviceId);
    clientDeviceIds.delete(ws);
  }
});
```

## 🎉 Ergebnis

- Tablet im Wohnzimmer bekommt nur Wohnzimmer-Events
- Handy in der Küche bekommt nur Küchen-Events  
- Desktop ohne Subscribe bekommt alle Events (z.B. für Monitoring)
- Automatisch, transparent, effizient!
