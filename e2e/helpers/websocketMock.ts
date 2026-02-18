import { Page } from '@playwright/test';

type Message = {
  type: string;
  roomId?: string;
  tradeId?: string;
  deviceId?: string;
  channel?: string;
  datapoint?: string;
  value?: string | number | boolean;
  channels?: string[];
  [key: string]: unknown;
};

export const installWebSocketMock = async (page: Page) => {
  await page.addInitScript(() => {
    type AnyPayload = Record<string, unknown>;

    const rooms = [
      { id: 1, name: 'Wohnzimmer' },
      { id: 2, name: 'Küche' },
    ];

    const trades = [
      { id: 10, name: 'Licht' },
      { id: 20, name: 'Heizung' },
    ];

    const roomChannels: Record<string, AnyPayload[]> = {
      '1': [
        {
          id: 101,
          name: 'Wohnzimmer Licht',
          address: 'BidCos-RF.LEQ0000001:1',
          interfaceName: 'BidCos-RF',
          type: 'SWITCH_VIRTUAL_RECEIVER',
          datapoints: {
            PROCESS: 0,
            SECTION: 0,
            SECTION_STATUS: 0,
            STATE: false,
          },
        },
      ],
      '2': [
        {
          id: 201,
          name: 'Küche Rollo',
          address: 'BidCos-RF.LEQ0000002:1',
          interfaceName: 'BidCos-RF',
          type: 'BLIND_VIRTUAL_RECEIVER',
          datapoints: {
            ACTIVITY_STATE: '0',
            COMBINED_PARAMETER: '0',
            LEVEL: '0.5',
            LEVEL_2: '0',
            LEVEL_2_STATUS: '0',
            LEVEL_STATUS: '0',
            PROCESS: '0',
            SECTION: '0',
            SECTION_STATUS: '0',
            STOP: 'false',
          },
        },
      ],
    };

    const tradeChannels: Record<string, AnyPayload[]> = {
      '10': [
        {
          id: 301,
          name: 'Flur Licht',
          address: 'BidCos-RF.LEQ0000003:1',
          interfaceName: 'BidCos-RF',
          type: 'SWITCH_VIRTUAL_RECEIVER',
          datapoints: {
            PROCESS: 0,
            SECTION: 0,
            SECTION_STATUS: 0,
            STATE: true,
          },
        },
      ],
      '20': [
        {
          id: 401,
          name: 'Wohnzimmer Thermostat',
          address: 'BidCos-RF.LEQ0000004:1',
          interfaceName: 'BidCos-RF',
          type: 'HEATING_CLIMATECONTROL_TRANSCEIVER',
          datapoints: {
            ACTIVE_PROFILE: 0,
            ACTUAL_TEMPERATURE: 21.5,
            ACTUAL_TEMPERATURE_STATUS: 0,
            BOOST_MODE: false,
            BOOST_TIME: 0,
            FROST_PROTECTION: false,
            HEATING_COOLING: 0,
            HUMIDITY: 40,
            HUMIDITY_STATUS: 0,
            PARTY_MODE: false,
            PARTY_SET_POINT_TEMPERATURE: 21,
            QUICK_VETO_TIME: 0,
            SET_POINT_MODE: 1,
            CONTROL_MODE: 1,
            SET_POINT_TEMPERATURE: 21,
            SWITCH_POINT_OCCURED: false,
            WINDOW_STATE: 0,
            VALVE_STATE: 10,
          },
        },
      ],
    };

    const state: {
      sockets: unknown[];
      sentMessages: Message[];
      subscriptions: string[];
    } = {
      sockets: [],
      sentMessages: [],
      subscriptions: [],
    };

    const broadcast = (payload: AnyPayload) => {
      for (const socket of state.sockets as MockWebSocket[]) {
        socket.dispatchMessage(payload);
      }
    };

    const delayedBroadcast = (payload: AnyPayload) => {
      setTimeout(() => broadcast(payload), 0);
    };

    const handleClientMessage = (message: Message) => {
      state.sentMessages.push(message);

      if (message.type === 'getRooms') {
        delayedBroadcast({
          rooms,
          deviceId: message.deviceId,
        });
        return;
      }

      if (message.type === 'getTrades') {
        delayedBroadcast({
          trades,
          deviceId: message.deviceId,
        });
        return;
      }

      if (message.type === 'getChannels') {
        const channels = message.roomId
          ? roomChannels[message.roomId] ?? []
          : tradeChannels[message.tradeId ?? ''] ?? [];

        delayedBroadcast({
          channels,
          deviceId: message.deviceId,
        });
        return;
      }

      if (message.type === 'subscribe') {
        state.subscriptions = Array.isArray(message.channels)
          ? message.channels
          : [];
        delayedBroadcast({ success: true });
        return;
      }

      if (message.type === 'setDatapoint') {
        delayedBroadcast({ success: true });
        if (typeof message.channel === 'string' && typeof message.datapoint === 'string') {
          delayedBroadcast({
            event: {
              channel: message.channel,
              datapoint: message.datapoint,
              value: message.value,
            },
          });
        }
      }
    };

    class MockWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      CONNECTING = 0;
      OPEN = 1;
      CLOSING = 2;
      CLOSED = 3;

      url: string;
      readyState = MockWebSocket.CONNECTING;
      protocol = '';
      extensions = '';
      bufferedAmount = 0;
      binaryType: BinaryType = 'blob';
      onopen: ((ev: Event) => unknown) | null = null;
      onmessage: ((ev: MessageEvent<string>) => unknown) | null = null;
      onclose: ((ev: CloseEvent) => unknown) | null = null;
      onerror: ((ev: Event) => unknown) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        state.sockets.push(this);

        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          const event = new Event('open');
          this.dispatchEvent(event);
          this.onopen?.(event);
        }, 0);
      }

      send(data: string) {
        try {
          const parsed = JSON.parse(data) as Message;
          handleClientMessage(parsed);
        } catch {
          // Ignore invalid payloads to keep mock resilient in tests.
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        const event = new CloseEvent('close');
        this.dispatchEvent(event);
        this.onclose?.(event);
      }

      dispatchMessage(payload: AnyPayload) {
        if (this.readyState !== MockWebSocket.OPEN) {
          return;
        }

        const event = new MessageEvent('message', {
          data: JSON.stringify(payload),
        });

        this.dispatchEvent(event);
        this.onmessage?.(event);
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });

    (window as Window & { __wsMock?: unknown }).__wsMock = {
      emitEvent: (event: { channel: string; datapoint: string; value: unknown }) => {
        broadcast({ event });
      },
      sentMessages: () => state.sentMessages,
      subscriptions: () => state.subscriptions,
    };
  });
};
