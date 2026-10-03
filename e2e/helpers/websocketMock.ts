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

export type WebSocketMockOptions = {
  // Like the go-server with AUTH_MODE=ccu: only Admin/secret can log in
  requireLogin?: boolean;
};

export const VALID_TOKEN = 'test-token';

export const installWebSocketMock = async (page: Page, options: WebSocketMockOptions = {}) => {
  await page.addInitScript(({ requireLogin, validToken }) => {
    type AnyPayload = Record<string, unknown>;

    const rooms = [
      { id: 1, name: 'Wohnzimmer' },
      { id: 2, name: 'Küche' },
      { id: 3, name: 'Heizungsraum' },
    ];

    const deviceProblems = [
      { address: '000A9D89A7AF25', name: 'Wandthermostat Flur', roomId: 1, roomName: 'Wohnzimmer', lowBat: false, unreach: true },
      { address: '003660C9930AB6', name: 'Fensterkontakt Bad', lowBat: true, unreach: false },
    ];

    let serviceMessages = [
      { id: 501, type: 'UNREACH', timestamp: '2026-01-15 09:12:00', address: '000A9D89A7AF25', name: 'Wandthermostat Flur', roomId: 1, roomName: 'Wohnzimmer' },
      { id: 502, type: 'LOW_BAT', timestamp: '2026-01-15 08:40:00', address: '003660C9930AB6', name: 'Fensterkontakt Bad' },
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
          statusAddress: 'BidCos-RF.LEQ0000001:0',
          status: { LOW_BAT: false, UNREACH: false },
          datapoints: {
            PROCESS: 0,
            SECTION: 0,
            SECTION_STATUS: 0,
            STATE: false,
          },
        },
        // No own control: shown by GenericControl with its values
        {
          id: 102,
          name: 'Fenstergriff Wohnzimmer',
          address: '0000DBE9A5C1F2:1',
          interfaceName: 'HmIP-RF',
          type: 'ROTARY_HANDLE_TRANSCEIVER',
          datapoints: { ERROR_CODE: 0, STATE: 2, SABOTAGE: false },
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
        {
          id: 202,
          name: 'Küche Fenster',
          address: 'BidCos-RF.LEQ0000005:1',
          interfaceName: 'BidCos-RF',
          type: 'BLIND_VIRTUAL_RECEIVER',
          datapoints: {
            ACTIVITY_STATE: '0',
            COMBINED_PARAMETER: '0',
            LEVEL: '0',
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

    roomChannels['3'] = [
      // HmIP-ESI with an electricity meter: one card for all four channels
      {
        id: 501,
        name: 'Stromzähler',
        address: '003FA2698BC439:1',
        interfaceName: 'HmIP-RF',
        type: 'ENERGIE_METER_TRANSMITTER',
        datapoints: { CHANNEL_OPERATION_MODE: 4, GAS_FLOW: 0, POWER: 87 },
      },
      {
        id: 502,
        name: 'HmIP-ESI 003FA2698BC439:2',
        address: '003FA2698BC439:2',
        interfaceName: 'HmIP-RF',
        type: 'ENERGIE_METER_TRANSMITTER',
        datapoints: { ENERGY_COUNTER: 20054800.9, GAS_VOLUME: 0 },
      },
      {
        id: 503,
        name: 'HmIP-ESI 003FA2698BC439:4',
        address: '003FA2698BC439:4',
        interfaceName: 'HmIP-RF',
        type: 'ENERGIE_METER_TRANSMITTER',
        datapoints: { ENERGY_COUNTER: 13678471 },
      },
      // No control exists for this type: must not show up as raw data
      {
        id: 504,
        name: 'Wochenprofil',
        address: '00195F29B04142:9',
        interfaceName: 'HmIP-RF',
        type: 'SWITCH_WEEK_PROFILE',
        datapoints: { WEEK_PROGRAM_CHANNEL_LOCKS: 0 },
      },
      {
        id: 505,
        name: 'Haustür',
        address: 'KEQ1063873:1',
        interfaceName: 'BidCos-RF',
        type: 'KEYMATIC',
        datapoints: { ERROR: 0, INHIBIT: false, OPEN: false, RELOCK_DELAY: 0, STATE: false, STATE_UNCERTAIN: false },
      },
      {
        id: 506,
        name: 'Kellertür',
        address: '002A1BE9A3C4D5:1',
        interfaceName: 'HmIP-RF',
        type: 'DOOR_LOCK_STATE_TRANSMITTER',
        datapoints: { ACTIVITY_STATE: 3, LOCK_STATE: 2, LOCK_TARGET_LEVEL: 1, PROCESS: 0, SECTION: 0, SECTION_STATUS: 0, WP_OPTIONS: 0 },
      },
    ];

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
        {
          id: 402,
          name: 'Fußbodenheizung Bad',
          address: '00201D8994A2B1:1',
          interfaceName: 'HmIP-RF',
          type: 'CLIMATECONTROL_FLOOR_TRANSCEIVER',
          datapoints: { LEVEL: 0.62, VALVE_STATE: 4 },
        },
      ],
    };

    // In no room or trade: only listed under "all devices"
    const unassignedChannels: AnyPayload[] = [
      {
        id: 601,
        name: 'Rauchmelder Flur',
        address: '000A1B2C3D4E5F:1',
        interfaceName: 'HmIP-RF',
        type: 'SMOKE_DETECTOR',
        datapoints: { SMOKE_DETECTOR_ALARM_STATUS: 0, SMOKE_DETECTOR_TEST_RESULT: null },
      },
    ];

    const allChannels = () => {
      const byAddress = new Map<unknown, AnyPayload>();
      for (const channel of [
        ...Object.values(roomChannels).flat(),
        ...Object.values(tradeChannels).flat(),
        ...unassignedChannels,
      ]) {
        byAddress.set(channel.address, channel);
      }
      return Array.from(byAddress.values());
    };

    // Paramset descriptions as the server sends them (camelCase)
    const paramsetDescriptions: Record<string, AnyPayload> = {
      '0000DBE9A5C1F2:1': {
        STATE: { type: 'ENUM', operations: 5, flags: 1, tabOrder: 0, min: 0, max: 2, valueList: ['CLOSED', 'TILTED', 'OPEN'] },
        SABOTAGE: { type: 'BOOL', operations: 5, flags: 9, tabOrder: 1 },
        ERROR_CODE: { type: 'INTEGER', operations: 5, flags: 1, tabOrder: 2, min: 0, max: 255 },
      },
    };

    const state: {
      sockets: unknown[];
      sentMessages: Message[];
      subscriptions: string[];
      authenticated: boolean;
      failNextSet: string | null;
    } = {
      sockets: [],
      sentMessages: [],
      subscriptions: [],
      authenticated: !requireLogin,
      failNextSet: null,
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

      if (message.type === 'auth') {
        if (!requireLogin) {
          delayedBroadcast({ type: 'auth_response', success: true, authRequired: false, level: 'admin', elevated: true });
          return;
        }
        state.authenticated = message.token === validToken;
        delayedBroadcast(
          state.authenticated
            ? { type: 'auth_response', success: true, authRequired: true, user: 'Admin', level: 'admin', token: validToken }
            : { type: 'auth_response', success: false, authRequired: true, code: 'LOGIN_REQUIRED' },
        );
        return;
      }

      if (message.type === 'login') {
        state.authenticated = message.username === 'Admin' && message.password === 'secret';
        delayedBroadcast(
          state.authenticated
            ? { type: 'auth_response', success: true, authRequired: true, user: 'Admin', level: 'admin', token: validToken }
            : { type: 'auth_response', success: false, authRequired: true, code: 'INVALID_CREDENTIALS' },
        );
        return;
      }

      if (!state.authenticated) {
        delayedBroadcast({ type: 'error', error: 'authentication required', code: 'AUTH_REQUIRED', requestId: message.requestId });
        return;
      }

      if (message.type === 'getServiceMessages') {
        delayedBroadcast({ type: 'getServiceMessages_response', messages: serviceMessages, requestId: message.requestId });
        return;
      }

      if (message.type === 'acknowledgeServiceMessage') {
        serviceMessages = serviceMessages.filter((m) => m.id !== message.id);
        delayedBroadcast({ type: 'acknowledgeServiceMessage_response', success: true, requestId: message.requestId });
        return;
      }

      if (message.type === 'getDeviceProblems') {
        delayedBroadcast({ type: 'deviceProblems', devices: deviceProblems, requestId: message.requestId });
        return;
      }

      if (message.type === 'getRooms') {
        delayedBroadcast({
          rooms,
          deviceId: message.deviceId,
          requestId: message.requestId,
        });
        return;
      }

      if (message.type === 'getTrades') {
        delayedBroadcast({
          trades,
          deviceId: message.deviceId,
          requestId: message.requestId,
        });
        return;
      }

      if (message.type === 'getChannels' && message.all === true) {
        delayedBroadcast({ channels: allChannels(), deviceId: message.deviceId, all: true, requestId: message.requestId });
        return;
      }

      if (message.type === 'getChannels') {
        const channels = message.roomId
          ? roomChannels[message.roomId] ?? []
          : tradeChannels[message.tradeId ?? ''] ?? [];

        delayedBroadcast({
          channels,
          deviceId: message.deviceId,
          roomId: message.roomId,
          tradeId: message.tradeId,
          requestId: message.requestId,
        });
        return;
      }

      if (message.type === 'subscribe') {
        state.subscriptions = Array.isArray(message.channels)
          ? message.channels
          : [];
        // Same shape as the go-server's subscribe_response
        delayedBroadcast({
          type: 'subscribe_response',
          success: true,
          deviceId: message.deviceId,
          channels: state.subscriptions,
        });
        return;
      }

      if (message.type === 'getParamsetDescription') {
        const description = paramsetDescriptions[String(message.address)];
        delayedBroadcast(
          description && message.paramsetKey === 'VALUES'
            ? { type: 'paramsetDescription', requestId: message.requestId, address: message.address, paramsetKey: message.paramsetKey, description }
            : { type: 'error', error: 'getParamsetDescription failed: Unknown paramset', requestId: message.requestId },
        );
        return;
      }

      if (message.type === 'setDatapoint') {
        const failCode = state.failNextSet;
        state.failNextSet = null;
        delayedBroadcast(
          failCode
            ? { type: 'setDatapoint_response', requestId: message.requestId, success: false, code: failCode }
            : { type: 'setDatapoint_response', requestId: message.requestId, success: true },
        );
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
      failNextSet: (code: string) => {
        state.failNextSet = code;
      },
    };
  }, { requireLogin: options.requireLogin === true, validToken: VALID_TOKEN });
};
