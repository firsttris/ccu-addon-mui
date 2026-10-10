import type { Page } from '@playwright/test';
import { protocolViolations } from './protocol';

type Message = {
  type: string;
  roomId?: string;
  tradeId?: string;
  favoriteId?: string;
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
  // Answer as openccu-lite: no ReGa, no WebUI, so no programs, system
  // variables, alarms or system settings
  lite?: boolean;
  // openccu-lite whose session expired: the gate passed no session
  sessionExpired?: boolean;
};

export const VALID_TOKEN = 'test-token';

// What the mock sent the app, per page, across reloads
const recordings = new WeakMap<Page, unknown[]>();

// The messages of the page that don't match protocol/schema.json
export const mockProtocolViolations = (page: Page) => protocolViolations(recordings.get(page) ?? []);

export const installWebSocketMock = async (page: Page, options: WebSocketMockOptions = {}) => {
  const recorded: unknown[] = [];
  recordings.set(page, recorded);
  await page.exposeFunction('__mockProtocol', (json: string) => {
    recorded.push(JSON.parse(json));
  });
  await page.addInitScript(
    ({ requireLogin, validToken, lite, sessionExpired }) => {
      const record = (message: unknown) =>
        (window as Window & { __mockProtocol?: (json: string) => void }).__mockProtocol?.(JSON.stringify(message));

      type AnyPayload = Record<string, unknown>;

      // What the login tells about the platform (platform.go)
      const platform = lite
        ? {
            platform: 'lite',
            capabilities: {
              programs: false,
              sysvars: false,
              alarms: false,
              history: false,
              system: false,
              users: false,
              selfUpdate: false,
              channelOptions: false,
              comTest: false,
            },
          }
        : {};

      const rooms = [
        { id: 1, name: 'Wohnzimmer' },
        { id: 2, name: 'Küche' },
        { id: 3, name: 'Heizungsraum' },
      ];

      const deviceProblems = [
        {
          address: '000A9D89A7AF25',
          name: 'Wandthermostat Flur',
          roomId: 1,
          roomName: 'Wohnzimmer',
          lowBat: false,
          unreach: true,
        },
        { address: '003660C9930AB6', name: 'Fensterkontakt Bad', lowBat: true, unreach: false },
      ];

      // The health page: maintenance values relative to now, so the page
      // reads the same whenever the test runs
      const ago = (seconds: number) => Math.floor(Date.now() / 1000) - seconds;
      const health = (values: Record<string, [unknown, number]>) =>
        Object.fromEntries(Object.entries(values).map(([k, [value, age]]) => [k, { value, time: ago(age) }]));
      const deviceHealth = [
        {
          address: '000A9D89A7AF25',
          name: 'Wandthermostat Flur',
          type: 'HmIP-WTH-2',
          interfaceName: 'HmIP-RF',
          roomId: 1,
          roomName: 'Wohnzimmer',
          values: health({
            LOW_BAT: [false, 7200],
            OPERATING_VOLTAGE: [2.4, 7200],
            RSSI_DEVICE: [-88, 7200],
            RSSI_PEER: [-86, 7200],
            UNREACH: [true, 1800],
          }),
          lowBatLimit: 2.2,
        },
        {
          address: '003660C9930AB6',
          name: 'Fensterkontakt Bad',
          type: 'HmIP-SWDO',
          interfaceName: 'HmIP-RF',
          roomName: 'Bad',
          values: health({
            LOW_BAT: [true, 600],
            OPERATING_VOLTAGE: [1.0, 600],
            RSSI_DEVICE: [-71, 600],
            RSSI_PEER: [-69, 600],
            UNREACH: [false, 600],
          }),
          lowBatLimit: 1.1,
        },
        {
          address: '00151BE9A1C2D3',
          name: 'Bewegungsmelder Flur',
          type: 'HmIP-SMI',
          interfaceName: 'HmIP-RF',
          roomName: 'Flur',
          values: health({
            LOW_BAT: [false, 300],
            OPERATING_VOLTAGE: [2.3, 300],
            RSSI_DEVICE: [-91, 300],
            RSSI_PEER: [-93, 300],
            UNREACH: [false, 300],
            CONFIG_PENDING: [true, 300],
          }),
          lowBatLimit: 2.2,
        },
        {
          address: '000855699C4F38',
          name: 'Taster Esszimmer',
          type: 'HmIP-WRC2',
          interfaceName: 'HmIP-RF',
          roomName: 'Esszimmer',
          values: health({
            LOW_BAT: [false, 86400 * 2],
            OPERATING_VOLTAGE: [2.8, 86400 * 2],
            RSSI_DEVICE: [-78, 86400 * 2],
            RSSI_PEER: [-75, 86400 * 2],
            UNREACH: [false, 86400 * 2],
          }),
          lowBatLimit: 2.2,
        },
        {
          address: 'LEQ0000001',
          name: 'Schaltaktor Keller',
          type: 'HM-LC-Sw1-FM',
          interfaceName: 'BidCos-RF',
          roomName: 'Keller',
          values: health({
            RSSI_DEVICE: [-65, 60],
            RSSI_PEER: [-63, 60],
            UNREACH: [false, 60],
            STICKY_UNREACH: [false, 60],
          }),
        },
      ];

      // Notification rules
      let rules: AnyPayload[] = [
        {
          id: 'rule-1',
          name: 'Fenster Bad lange offen',
          enabled: true,
          minutes: 15,
          message: '',
          summary:
            'Fensterkontakt Bad: Zustand ist nicht geschlossen und Wandthermostat Flur: Temperatur kleiner als 18 °C · seit 15 Minuten',
          conditions: [
            {
              channelId: 1301,
              interfaceName: 'HmIP-RF',
              address: '003660C9930AB6:1',
              datapoint: 'STATE',
              op: 'ne',
              value: 0,
            },
            {
              channelId: 1102,
              interfaceName: 'HmIP-RF',
              address: '000A9D89A7AF25:1',
              datapoint: 'ACTUAL_TEMPERATURE',
              op: 'lt',
              value: 18,
            },
          ],
        },
        {
          id: 'rule-2',
          name: 'Haustür nachts geöffnet',
          enabled: false,
          minutes: 0,
          from: '22:00',
          to: '06:00',
          message: 'Die Haustür wurde nachts geöffnet',
          summary: 'Haustür: Zustand ist nicht geschlossen · 22:00–06:00 Uhr',
          conditions: [
            {
              channelId: 1201,
              interfaceName: 'HmIP-RF',
              address: '0000DBE9A5C1F2:1',
              datapoint: 'STATE',
              op: 'ne',
              value: 0,
            },
          ],
        },
      ];

      // Alarm messages: none unless a test sets them (__wsMock.setAlarms)
      let alarms: AnyPayload[] = [];

      const sysvars = [
        {
          id: 950,
          name: 'Anwesenheit',
          visible: true,
          kind: 'bool',
          value: true,
          trueName: 'anwesend',
          falseName: 'abwesend',
        },
      ];
      const programs = [{ id: 1201, name: 'Rollläden abends schließen', active: true, visible: true, operate: true }];

      // Tile layouts by room, trade or favorite list (kept across reloads)
      const layouts: Record<string, string> = JSON.parse(sessionStorage.getItem('mock-layouts') ?? '{}');
      window.addEventListener('beforeunload', () => sessionStorage.setItem('mock-layouts', JSON.stringify(layouts)));

      // Favorite lists of the logged-in user
      let nextFavoriteId = 1400;
      let favorites: { id: number; name: string; items: { id: number; type: string }[] }[] = [
        {
          id: 1300,
          name: 'Abends',
          items: [
            { id: 101, type: 'CHANNEL' },
            { id: 301, type: 'CHANNEL' },
            { id: 950, type: 'SYSVAR' },
            { id: 1201, type: 'PROGRAM' },
          ],
        },
        { id: 1301, name: 'Gäste', items: [{ id: 301, type: 'CHANNEL' }] },
      ];

      let serviceMessages = [
        {
          id: 501,
          type: 'UNREACH',
          timestamp: '2026-01-15 09:12:00',
          address: '000A9D89A7AF25',
          name: 'Wandthermostat Flur',
          roomId: 1,
          roomName: 'Wohnzimmer',
        },
        {
          id: 502,
          type: 'LOW_BAT',
          timestamp: '2026-01-15 08:40:00',
          address: '003660C9930AB6',
          name: 'Fensterkontakt Bad',
        },
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
          {
            id: 102,
            name: 'Fenstergriff Wohnzimmer',
            address: '0000DBE9A5C1F2:1',
            interfaceName: 'HmIP-RF',
            type: 'ROTARY_HANDLE_TRANSCEIVER',
            datapoints: { ERROR_CODE: 0, STATE: 2, SABOTAGE: false },
          },
          {
            id: 103,
            name: 'Terrassentür',
            address: 'BidCos-RF.LEQ0000006:1',
            interfaceName: 'BidCos-RF',
            type: 'SHUTTER_CONTACT',
            datapoints: { ERROR: 0, LOWBAT: false, STATE: false },
          },
          {
            id: 105,
            name: 'Esstisch',
            address: '0001D3C99C1A2B:4',
            interfaceName: 'HmIP-RF',
            type: 'DIMMER_VIRTUAL_RECEIVER',
            datapoints: { ACTIVITY_STATE: 3, LEVEL: 0.6, LEVEL_STATUS: 0, PROCESS: 0, SECTION: 0, SECTION_STATUS: 0 },
          },
          {
            id: 106,
            name: 'LED-Streifen',
            address: '0001E0A99B2C3D:2',
            interfaceName: 'HmIP-RF',
            type: 'UNIVERSAL_LIGHT_RECEIVER',
            datapoints: { LEVEL: 0.8, HUE: 275, SATURATION: 1, COLOR_TEMPERATURE: 3000, ACTIVITY_STATE: 3 },
          },
          {
            id: 107,
            name: 'Wandtaster Wohnzimmer oben',
            address: '0001D8A9A1B2C3:1',
            interfaceName: 'HmIP-RF',
            type: 'KEY_TRANSCEIVER',
            datapoints: { PRESS_LONG: null, PRESS_LONG_RELEASE: null, PRESS_LONG_START: null, PRESS_SHORT: null },
          },
          {
            id: 108,
            name: 'Wandtaster Wohnzimmer unten',
            address: '0001D8A9A1B2C3:2',
            interfaceName: 'HmIP-RF',
            type: 'KEY_TRANSCEIVER',
            datapoints: { PRESS_LONG: null, PRESS_LONG_RELEASE: null, PRESS_LONG_START: null, PRESS_SHORT: null },
          },
          // No own control: shown by GenericControl with its values
          {
            id: 104,
            name: 'Leistungsschwelle Waschmaschine',
            address: 'LEQ0000020:3',
            interfaceName: 'BidCos-RF',
            type: 'CONDITION_POWER',
            datapoints: { DECISION_VALUE: false },
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
          {
            id: 203,
            name: 'Fenstergriff Küche',
            address: 'BidCos-RF.LEQ0000007:1',
            interfaceName: 'BidCos-RF',
            type: 'ROTARY_HANDLE_SENSOR',
            datapoints: { ERROR: 0, LOWBAT: false, STATE: 1 },
          },
          {
            id: 204,
            name: 'Küche Klima',
            address: '000E1BE9A4C5D6:1',
            interfaceName: 'HmIP-RF',
            type: 'CLIMATE_TRANSCEIVER',
            datapoints: { ACTUAL_TEMPERATURE: 21.4, HUMIDITY: 58 },
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
          id: 509,
          name: 'Zirkulationspumpe',
          address: '00195F29B04142:4',
          interfaceName: 'HmIP-RF',
          type: 'SWITCH_VIRTUAL_RECEIVER',
          datapoints: { PROCESS: 0, SECTION: 0, SECTION_STATUS: 0, STATE: true },
        },
        {
          id: 507,
          name: 'Garagentor',
          address: '0019DA49A6B7C8:1',
          interfaceName: 'HmIP-RF',
          type: 'DOOR_RECEIVER',
          datapoints: { DOOR_STATE: 0, PROCESS: 0, SECTION: 0, SECTION_STATUS: 0 },
        },
        {
          id: 508,
          name: 'Wassermelder Heizung',
          address: '00319BE9A8B9C1:1',
          interfaceName: 'HmIP-RF',
          type: 'WATER_DETECTION_TRANSMITTER',
          datapoints: { ALARMSTATE: false, MOISTURE_DETECTED: false, WATERLEVEL_DETECTED: false },
        },
        {
          id: 506,
          name: 'Kellertür',
          address: '002A1BE9A3C4D5:1',
          interfaceName: 'HmIP-RF',
          type: 'DOOR_LOCK_STATE_TRANSMITTER',
          datapoints: {
            ACTIVITY_STATE: 3,
            LOCK_STATE: 2,
            LOCK_TARGET_LEVEL: 1,
            PROCESS: 0,
            SECTION: 0,
            SECTION_STATUS: 0,
            WP_OPTIONS: 0,
          },
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
        // Side channels: floor heating pump, door lock drive HmIP-DLP (door
        // state, auto relock, two users), lock sensor HmIP-DLS, status LED
        {
          id: 651,
          name: 'Fußbodenheizung Pumpe',
          address: '00309D89A1B2C1:1',
          interfaceName: 'HmIP-RF',
          type: 'CLIMATECONTROL_FLOOR_PUMP_TRANSCEIVER',
          datapoints: {
            STATE: true,
            DEW_POINT_ALARM: false,
            EMERGENCY_OPERATION: false,
            FROST_PROTECTION: false,
            HUMIDITY_LIMITER: true,
            EXTERNAL_CLOCK: false,
          },
        },
        {
          id: 652,
          name: 'Haustür Zustand',
          address: '00319D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'DOOR_STATE_TRANSCEIVER',
          datapoints: { STATE: 0, STATE_STATUS: 0, CALIBRATE_DOOR_STATE: null },
        },
        {
          id: 653,
          name: 'Haustür Auto-Relock',
          address: '00319D89A1B2C1:13',
          interfaceName: 'HmIP-RF',
          type: 'AUTO_RELOCK_TRANSCEIVER',
          datapoints: { AUTO_RELOCK_STATE: true, PROCESS: 0 },
        },
        {
          id: 654,
          name: 'Haustür Anna',
          address: '00319D89A1B2C1:4',
          interfaceName: 'HmIP-RF',
          type: 'PERMISSION_TRANSCEIVER',
          datapoints: { PERMISSION_STATE: true },
        },
        {
          id: 655,
          name: 'Haustür Ben',
          address: '00319D89A1B2C1:5',
          interfaceName: 'HmIP-RF',
          type: 'PERMISSION_TRANSCEIVER',
          datapoints: { PERMISSION_STATE: false },
        },
        {
          id: 656,
          name: 'Riegelkontakt Keller',
          address: '00329D89A1B2C1:1',
          interfaceName: 'HmIP-RF',
          type: 'DOOR_LOCK_STATE_TRANSCEIVER',
          datapoints: { LOCK_STATE: 1 },
        },
        {
          id: 657,
          name: 'Status-LED Flur',
          address: '00339D89A1B2C1:12',
          interfaceName: 'HmIP-RF',
          type: 'OPTICAL_SIGNAL_RECEIVER',
          datapoints: { LEVEL: 1, COLOR: 2, COLOR_BEHAVIOUR: 3 },
        },
        // Servo controller HmIP-WSC (actual position, first servo with ramp)
        // and the alarm output of the water safety system HmIP-WSS
        {
          id: 658,
          name: 'Lüftungsklappe Ist',
          address: '00349D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'SERVO_TRANSMITTER',
          datapoints: { LEVEL: 0.25, LEVEL_STATUS: 0, ERROR_RESTART_NEEDED: false },
        },
        {
          id: 659,
          name: 'Lüftungsklappe',
          address: '00349D89A1B2C1:4',
          interfaceName: 'HmIP-RF',
          type: 'SERVO_VIRTUAL_RECEIVER',
          datapoints: { LEVEL: 0.25, LEVEL_STATUS: 0 },
        },
        {
          id: 660,
          name: 'Alarmausgang Wasser',
          address: '00359D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'ALARM_ACTUATOR_RECEIVER',
          datapoints: { STATE: false },
        },
        // Distance sensor ELV-SH-DUSI, passage detector HmIP-SPDR (channel 2
        // right to left, 3 left to right), filling level sensor HM-Sen-Wa-Od
        // and the meter sensor HM-ES-TX-WM with an IEC sensor
        {
          id: 661,
          name: 'Zisterne Abstand',
          address: '00369D89A1B2C1:1',
          interfaceName: 'HmIP-RF',
          type: 'DISTANCE_TRANSMITTER',
          datapoints: { DISTANCE: 0.8, DISTANCE_STATUS: 0, HEIGHT: 1.2, REFERENCE_HEIGHT: 2 },
        },
        {
          id: 662,
          name: 'Durchgang Flur',
          address: '00379D89A1B2C1:2',
          interfaceName: 'HmIP-RF',
          type: 'PASSAGE_DETECTOR_DIRECTION_TRANSMITTER',
          datapoints: {
            PASSAGE_COUNTER_VALUE: 12,
            PASSAGE_COUNTER_OVERFLOW: false,
            CURRENT_PASSAGE_DIRECTION: false,
            LAST_PASSAGE_DIRECTION: true,
          },
        },
        {
          id: 663,
          name: 'Durchgang Flur links nach rechts',
          address: '00379D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'PASSAGE_DETECTOR_DIRECTION_TRANSMITTER',
          datapoints: {
            PASSAGE_COUNTER_VALUE: 9,
            PASSAGE_COUNTER_OVERFLOW: false,
            CURRENT_PASSAGE_DIRECTION: false,
            LAST_PASSAGE_DIRECTION: false,
          },
        },
        {
          id: 664,
          name: 'Heizöltank',
          address: 'LEQ0000030:1',
          interfaceName: 'BidCos-RF',
          type: 'CAPACITIVE_FILLING_LEVEL_SENSOR',
          datapoints: { FILLING_LEVEL: 40 },
        },
        {
          id: 665,
          name: 'Stromzähler Hausanschluss',
          address: 'LEQ0000031:1',
          interfaceName: 'BidCos-RF',
          type: 'POWERMETER_IEC1',
          datapoints: { ENERGY_COUNTER: 0, POWER: 0, IEC_ENERGY_COUNTER: 18342.5, IEC_POWER: 512.3, BOOT: false },
        },
        // Displays: the e-paper of the HmIP-WRCD, the HM-RC-19 and a tile of
        // the HmIP-WGD, which is hidden as in the WebUI
        {
          id: 666,
          name: 'Display Flur',
          address: '00389D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'ACOUSTIC_DISPLAY_RECEIVER',
          datapoints: { COMBINED_PARAMETER: '', DISPLAY_DATA_ID: 1, DISPLAY_DATA_STRING: '' },
        },
        {
          id: 667,
          name: 'Fernbedienung Display',
          address: 'LEQ0000032:18',
          interfaceName: 'BidCos-RF',
          type: 'DISPLAY',
          datapoints: { TEXT: '', UNIT: 0, BACKLIGHT: 0, BEEP: 0, SUBMIT: false },
        },
        {
          id: 668,
          name: 'Wandtafel Kachel 1',
          address: '00399D89A1B2C1:1',
          interfaceName: 'HmIP-RF',
          type: 'DISPLAY_INPUT_TRANSMITTER',
          datapoints: { PRESS_SHORT: false, PRESS_LONG: false },
        },
        // Irrigation, its water meter and window drives
        {
          id: 641,
          name: 'Bewässerung Beet',
          address: '00299D89A1B2C1:3',
          interfaceName: 'HmIP-RF',
          type: 'WATER_SWITCH_VIRTUAL_RECEIVER',
          datapoints: { STATE: false, PROCESS: 0 },
        },
        {
          id: 642,
          name: 'Wasserzähler Beet',
          address: '00299D89A1B2C1:6',
          interfaceName: 'HmIP-RF',
          type: 'FLOW_METER_TRANSMITTER',
          datapoints: { WATER_FLOW: 0, WATER_FLOW_STATUS: 0, WATER_VOLUME: 1284.5, WATER_VOLUME_SINCE_OPEN: 42.3 },
        },
        {
          id: 643,
          name: 'Oberlicht Treppenhaus',
          address: '00299D89A1B2C2:1',
          interfaceName: 'HmIP-RF',
          type: 'WINDOW_DRIVE_RECEIVER',
          datapoints: { LEVEL: 0, LEVEL_STATUS: 0, ACTIVITY_STATE: 3 },
        },
        {
          id: 644,
          name: 'Dachfenster Bad',
          address: 'NEQ0001234:1',
          interfaceName: 'BidCos-RF',
          type: 'WINMATIC',
          datapoints: { LEVEL: -0.005, STATE_UNCERTAIN: false, ERROR: 0 },
        },
        // Sensors with their own tiles
        {
          id: 631,
          name: 'Regensensor',
          address: '00199D89A1B2C3:1',
          interfaceName: 'HmIP-RF',
          type: 'RAIN_DETECTION_TRANSMITTER',
          datapoints: { RAINING: false, HEATER_STATE: false, ACTUAL_TEMPERATURE: 11.5, ACTUAL_TEMPERATURE_STATUS: 0 },
        },
        {
          id: 632,
          name: 'Lichtsensor Terrasse',
          address: '00199D89A1B2C4:1',
          interfaceName: 'HmIP-RF',
          type: 'BRIGHTNESS_TRANSMITTER',
          datapoints: {
            CURRENT_ILLUMINATION: 5320,
            CURRENT_ILLUMINATION_STATUS: 0,
            AVERAGE_ILLUMINATION: 4800,
            LOWEST_ILLUMINATION: 120,
            HIGHEST_ILLUMINATION: 9100,
          },
        },
        {
          id: 633,
          name: 'CO₂ Arbeitszimmer',
          address: '00199D89A1B2C5:1',
          interfaceName: 'HmIP-RF',
          type: 'CARBON_DIOXIDE_RECEIVER',
          datapoints: { CONCENTRATION: 820, CONCENTRATION_STATUS: 0 },
        },
        {
          id: 634,
          name: 'Feinstaub Wohnzimmer',
          address: '00199D89A1B2C6:1',
          interfaceName: 'HmIP-RF',
          type: 'TEMP_HUMIDITY_PARTICULATE_MATTER_TRANSMITTER',
          datapoints: {
            MASS_CONCENTRATION_PM_2_5: 7.4,
            MASS_CONCENTRATION_PM_10: 11.2,
            ACTUAL_TEMPERATURE: 21.3,
            HUMIDITY: 46,
            TYPICAL_PARTICLE_SIZE: 0.62,
          },
        },
        {
          id: 635,
          name: 'Beet Bodenfeuchte',
          address: '00199D89A1B2C7:1',
          interfaceName: 'HmIP-RF',
          type: 'SOIL_MOISTURE_TRANSMITTER',
          datapoints: {
            SOIL_MOISTURE: 22,
            SOIL_MOISTURE_STATUS: 0,
            SOIL_TEMPERATURE: 14.2,
            SOIL_TEMPERATURE_STATUS: 0,
          },
        },
        {
          id: 636,
          name: 'Neigungssensor Garage',
          address: '00199D89A1B2C8:1',
          interfaceName: 'HmIP-RF',
          type: 'ACCELERATION_TRANSCEIVER',
          datapoints: { MOTION: false },
        },
        {
          id: 637,
          name: 'Netzausfall Keller',
          address: '00199D89A1B2C9:1',
          interfaceName: 'HmIP-RF',
          type: 'POWER_MAINS_TRANSMITTER',
          datapoints: { POWER_MAINS_FAILURE: false },
        },
        // Inputs of a contact interface: one wired as a contact, one as a
        // key (no channel mode stored, as after pairing)
        {
          id: 621,
          name: 'Gartentor',
          address: '0019A0C9B3E2D1:1',
          interfaceName: 'HmIP-RF',
          type: 'MULTI_MODE_INPUT_TRANSMITTER',
          mode: 3,
          datapoints: { STATE: false, PRESS_SHORT: false, PRESS_LONG: false },
        },
        {
          id: 622,
          name: 'Klingeltaster',
          address: '0019A0C9B3E2D2:1',
          interfaceName: 'HmIP-RF',
          type: 'MULTI_MODE_INPUT_TRANSMITTER',
          datapoints: { STATE: false, PRESS_SHORT: false, PRESS_LONG: false },
        },
        {
          id: 601,
          name: 'Rauchmelder Flur',
          address: '000A1B2C3D4E5F:1',
          interfaceName: 'HmIP-RF',
          type: 'SMOKE_DETECTOR',
          datapoints: { SMOKE_DETECTOR_ALARM_STATUS: 0, SMOKE_DETECTOR_TEST_RESULT: null },
        },
        {
          id: 611,
          name: 'HmIP-FWI 002BE0C98ECD57:1',
          address: '002BE0C98ECD57:1',
          interfaceName: 'HmIP-RF',
          type: 'ACCESS_TRANSCEIVER',
          datapoints: { ACCESS_AUTHORIZATION: null, STATE: true },
        },
        {
          id: 612,
          name: 'HmIP-FWI 002BE0C98ECD57:2',
          address: '002BE0C98ECD57:2',
          interfaceName: 'HmIP-RF',
          type: 'ACCESS_TRANSCEIVER',
          datapoints: { ACCESS_AUTHORIZATION: null, STATE: true },
        },
        {
          id: 613,
          name: 'HmIP-FWI 002BE0C98ECD57:3',
          address: '002BE0C98ECD57:3',
          interfaceName: 'HmIP-RF',
          type: 'ACCESS_TRANSCEIVER',
          datapoints: { ACCESS_AUTHORIZATION: null, STATE: true },
        },
        {
          id: 614,
          name: 'HmIP-FWI 002BE0C98ECD57:4',
          address: '002BE0C98ECD57:4',
          interfaceName: 'HmIP-RF',
          type: 'ACCESS_TRANSCEIVER',
          datapoints: { ACCESS_AUTHORIZATION: null, STATE: false },
        },
        {
          id: 621,
          name: 'HmIPW-DRAP 00179A4989A48D:1',
          address: '00179A4989A48D:1',
          interfaceName: 'HmIP-RF',
          type: 'ACCESSPOINT_GENERIC_RECEIVER',
          datapoints: { CURRENT: 0, CURRENT_STATUS: 0, VOLTAGE: 24.4, VOLTAGE_STATUS: 0 },
        },
        {
          id: 622,
          name: 'HmIPW-DRAP 00179A4989A48D:2',
          address: '00179A4989A48D:2',
          interfaceName: 'HmIP-RF',
          type: 'ACCESSPOINT_GENERIC_RECEIVER',
          datapoints: { CURRENT: 140, CURRENT_STATUS: 0, VOLTAGE: 24.3, VOLTAGE_STATUS: 0 },
        },
        {
          id: 630,
          name: 'Heizkörper Gästezimmer',
          address: 'LEQ0000010:4',
          interfaceName: 'BidCos-RF',
          type: 'CLIMATECONTROL_RT_TRANSCEIVER',
          datapoints: {
            ACTUAL_TEMPERATURE: 19.5,
            BATTERY_STATE: 2.9,
            BOOST_STATE: 0,
            CONTROL_MODE: 0,
            SET_TEMPERATURE: 21,
            VALVE_STATE: 34,
          },
        },
        {
          id: 631,
          name: 'Raffstore Büro',
          address: '0045D8A9A2B3C4:4',
          interfaceName: 'HmIP-RF',
          type: 'BLIND_VIRTUAL_RECEIVER',
          datapoints: {
            ACTIVITY_STATE: 3,
            LEVEL: 0.7,
            LEVEL_2: 0.5,
            LEVEL_STATUS: 0,
            LEVEL_2_STATUS: 0,
            PROCESS: 0,
            SECTION: 0,
            SECTION_STATUS: 0,
          },
        },
        {
          id: 632,
          name: 'Sirene Flur',
          address: '0039E0A9A4B5C6:3',
          interfaceName: 'HmIP-RF',
          type: 'ALARM_SWITCH_VIRTUAL_RECEIVER',
          datapoints: {
            ACOUSTIC_ALARM_ACTIVE: false,
            OPTICAL_ALARM_ACTIVE: false,
            ACOUSTIC_ALARM_SELECTION: 0,
            OPTICAL_ALARM_SELECTION: 0,
          },
        },
        {
          id: 604,
          name: 'Bewegungsmelder Eingang',
          address: '000BBD89A1C2D3:1',
          interfaceName: 'HmIP-RF',
          type: 'MOTIONDETECTOR_TRANSCEIVER',
          datapoints: { ILLUMINATION: 118.5, MOTION: true, MOTION_DETECTION_ACTIVE: true },
        },
        {
          id: 603,
          name: 'Schalter Flur Beleuchtung',
          address: '00091D89A9B8C7:8',
          interfaceName: 'HmIP-RF',
          type: 'DIMMER_VIRTUAL_RECEIVER',
          datapoints: { COLOR: 1, LEVEL: 0.4, ACTIVITY_STATE: 3 },
        },
        // BidCos LED controllers (rgbw.fn, dual_white_controller.fn)
        {
          id: 610,
          name: 'LED-Band Terrasse',
          address: 'LEQ0000040:1',
          interfaceName: 'BidCos-RF',
          type: 'DIMMER',
          datapoints: { LEVEL: 0.7 },
        },
        {
          id: 611,
          name: 'LED-Band Terrasse Farbe',
          address: 'LEQ0000040:2',
          interfaceName: 'BidCos-RF',
          type: 'RGBW_COLOR',
          datapoints: { COLOR: 132 },
        },
        {
          id: 612,
          name: 'LED-Band Terrasse Programm',
          address: 'LEQ0000040:3',
          interfaceName: 'BidCos-RF',
          type: 'RGBW_AUTOMATIC',
          datapoints: { PROGRAM: 0 },
        },
        {
          id: 613,
          name: 'Deckenlicht Büro',
          address: 'LEQ0000041:1',
          interfaceName: 'BidCos-RF',
          type: 'DUAL_WHITE_BRIGHTNESS',
          datapoints: { LEVEL: 0.5 },
        },
        {
          id: 614,
          name: 'Deckenlicht Büro Weiß',
          address: 'LEQ0000041:2',
          interfaceName: 'BidCos-RF',
          type: 'DUAL_WHITE_COLOR',
          datapoints: { LEVEL: 0.3 },
        },
        // Chimes (acoustic_signal.fn, HM-OU-CFM)
        {
          id: 620,
          name: 'MP3-Gong Flur',
          address: '00185D89A1B2C9:2',
          interfaceName: 'HmIP-RF',
          type: 'ACOUSTIC_SIGNAL_VIRTUAL_RECEIVER',
          datapoints: { LEVEL: 0, SOUNDFILE: 0 },
        },
        {
          id: 621,
          name: 'MP3-Gong Flur Status',
          address: '00185D89A1B2C9:1',
          interfaceName: 'HmIP-RF',
          type: 'ACOUSTIC_SIGNAL_TRANSMITTER',
          datapoints: { LEVEL: 0, SOUNDFILE: 0 },
        },
        {
          id: 622,
          name: 'Funkgong Diele',
          address: 'LEQ0000042:2',
          interfaceName: 'BidCos-RF',
          type: 'SIGNAL_CHIME',
          datapoints: { STATE: false, WORKING: false },
        },
        {
          id: 623,
          name: 'Funkgong Diele Licht',
          address: 'LEQ0000042:1',
          interfaceName: 'BidCos-RF',
          type: 'SIGNAL_LED',
          datapoints: { STATE: false, WORKING: false },
        },
        // Water protection (HmIP-WSS): shut-off valve, flow and pressure
        {
          id: 630,
          name: 'Wasserschutz Hauptleitung',
          address: '0047D8A9A5B6C7:3',
          interfaceName: 'HmIP-RF',
          type: 'VALVE_ACTUATOR_RECEIVER',
          datapoints: { LEVEL: 1, LEVEL_STATUS: 0, ACTIVITY_STATE: 3 },
        },
        {
          id: 631,
          name: 'Wasserschutz Durchfluss',
          address: '0047D8A9A5B6C7:6',
          interfaceName: 'HmIP-RF',
          type: 'WATER_FLOW_TRANSMITTER',
          datapoints: { WATER_FLOW: 3.4, WATER_FLOW_STATUS: 0 },
        },
        {
          id: 632,
          name: 'Wasserschutz Druck',
          address: '0047D8A9A5B6C7:7',
          interfaceName: 'HmIP-RF',
          type: 'WATER_PRESSURE_TRANSMITTER',
          datapoints: { WATER_PRESSURE: 3.1, WATER_PRESSURE_STATUS: 0 },
        },
        {
          id: 602,
          name: 'Wetterstation Garten',
          address: '00099D89A1B2C3:1',
          interfaceName: 'HmIP-RF',
          type: 'WEATHER_TRANSMIT',
          datapoints: {
            ACTUAL_TEMPERATURE: 6.3,
            HUMIDITY: 81,
            ILLUMINATION: 4250,
            RAINING: true,
            RAIN_COUNTER: 3.2,
            SUNSHINEDURATION: 42,
            WIND_SPEED: 23.4,
          },
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
        '00369D89A1B2C1:1': {
          DISTANCE: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 0, min: 0, max: 10, unit: 'm' },
          HEIGHT: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 1, min: 0, max: 10, unit: 'm' },
          REFERENCE_HEIGHT: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 2, min: 0, max: 10, unit: 'm' },
        },
        'LEQ0000031:1': {
          IEC_ENERGY_COUNTER: {
            type: 'FLOAT',
            operations: 5,
            flags: 1,
            tabOrder: 0,
            min: 0,
            max: 214748364.7,
            unit: 'kWh',
          },
          IEC_POWER: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 1, min: 0, max: 214748364.7, unit: 'W' },
        },
        '0000DBE9A5C1F2:1': {
          STATE: {
            type: 'ENUM',
            operations: 5,
            flags: 1,
            tabOrder: 0,
            min: 0,
            max: 2,
            valueList: ['CLOSED', 'TILTED', 'OPEN'],
          },
          SABOTAGE: { type: 'BOOL', operations: 5, flags: 9, tabOrder: 1 },
          ERROR_CODE: { type: 'INTEGER', operations: 5, flags: 1, tabOrder: 2, min: 0, max: 255 },
        },
        '000A1B2C3D4E5F:1': {
          SMOKE_DETECTOR_ALARM_STATUS: {
            type: 'ENUM',
            operations: 5,
            flags: 1,
            tabOrder: 0,
            min: 0,
            max: 3,
            valueList: ['IDLE_OFF', 'PRIMARY_ALARM', 'INTRUSION_ALARM', 'SECONDARY_ALARM'],
          },
          SMOKE_DETECTOR_COMMAND: {
            type: 'ENUM',
            operations: 2,
            flags: 1,
            tabOrder: 1,
            min: 0,
            max: 5,
            valueList: [
              'RESERVED_ALARM_OFF',
              'INTRUSION_ALARM_OFF',
              'INTRUSION_ALARM',
              'SMOKE_TEST',
              'COMMUNICATION_TEST',
              'COMMUNICATION_TEST_REPEATED',
            ],
          },
          SMOKE_DETECTOR_TEST_RESULT: {
            type: 'ENUM',
            operations: 5,
            flags: 1,
            tabOrder: 2,
            min: 0,
            max: 4,
            valueList: [
              'NONE',
              'SMOKE_TEST_OK',
              'SMOKE_TEST_FAILED',
              'COMMUNICATION_TEST_SENT',
              'COMMUNICATION_TEST_OK',
            ],
          },
        },
        '002BE0C98ECD57:1': {
          STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
          ACCESS_AUTHORIZATION: {
            type: 'ENUM',
            operations: 4,
            flags: 1,
            tabOrder: 1,
            min: 0,
            max: 1,
            valueList: ['DISABLE', 'ENABLE'],
          },
        },
        '00309D89A1B2C1:1': {
          STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
        },
        '00319D89A1B2C1:13': {
          AUTO_RELOCK_STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
        },
        '00319D89A1B2C1:4': {
          PERMISSION_STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
        },
        '00319D89A1B2C1:5': {
          PERMISSION_STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
        },
        '00299D89A1B2C1:3': {
          STATE: { type: 'BOOL', operations: 7, flags: 1, tabOrder: 0 },
          ON_TIME: { type: 'FLOAT', operations: 2, flags: 1, tabOrder: 1, min: 0, max: 8580000, unit: 's' },
        },
        '00299D89A1B2C1:6': {
          WATER_FLOW: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 0, min: 0, max: 10000, unit: 'l/h' },
          WATER_VOLUME: { type: 'FLOAT', operations: 5, flags: 1, tabOrder: 1, min: 0, max: 1000000, unit: 'l' },
        },
        'LEQ0000020:3': {
          DECISION_VALUE: { type: 'BOOL', operations: 5, flags: 1, tabOrder: 0 },
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

      // An event as the server sends it (go-server/pkg/types): with the
      // interface, here taken from the channel ("BidCos-RF.LEQ0000001:1"), and a timestamp
      const eventMessage = (event: { channel: string; datapoint: string; value: unknown }) => ({
        event: {
          interface: event.channel.includes('.') ? event.channel.split('.')[0] : 'HmIP-RF',
          timestamp: new Date().toISOString(),
          ...event,
        },
      });

      const broadcast = (payload: AnyPayload) => {
        record(payload);
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
          if (sessionExpired) {
            delayedBroadcast({
              type: 'auth_response',
              success: false,
              authRequired: false,
              elevated: false,
              code: 'SESSION_REQUIRED',
              error: 'no session of the system',
            });
            return;
          }
          if (!requireLogin) {
            delayedBroadcast({
              type: 'auth_response',
              success: true,
              authRequired: false,
              level: 'admin',
              elevated: true,
              ...platform,
            });
            return;
          }
          state.authenticated = message.token === validToken;
          delayedBroadcast(
            state.authenticated
              ? {
                  type: 'auth_response',
                  success: true,
                  authRequired: true,
                  user: 'Admin',
                  level: 'admin',
                  token: validToken,
                  elevated: false,
                  ...platform,
                }
              : { type: 'auth_response', success: false, authRequired: true, code: 'LOGIN_REQUIRED', elevated: false },
          );
          return;
        }

        if (message.type === 'login') {
          state.authenticated = message.username === 'Admin' && message.password === 'secret';
          delayedBroadcast(
            state.authenticated
              ? {
                  type: 'auth_response',
                  success: true,
                  authRequired: true,
                  user: 'Admin',
                  level: 'admin',
                  token: validToken,
                  elevated: false,
                  ...platform,
                }
              : {
                  type: 'auth_response',
                  success: false,
                  authRequired: true,
                  code: 'INVALID_CREDENTIALS',
                  elevated: false,
                },
          );
          return;
        }

        if (!state.authenticated) {
          delayedBroadcast({
            type: 'error',
            error: 'authentication required',
            code: 'AUTH_REQUIRED',
            requestId: message.requestId,
          });
          return;
        }

        // Pairing: not in install mode; openccu-lite in the local key mode
        if (message.type === 'getInstallMode') {
          delayedBroadcast({
            type: 'getInstallMode_response',
            success: true,
            seconds: 0,
            ...(lite && message.interfaceName === 'HmIP-RF'
              ? { hmip: { keyserverMode: 'LOCAL', deviceKeys: 2, offlinePairing: false } }
              : {}),
            requestId: message.requestId,
          });
          return;
        }
        if (message.type === 'getInbox') {
          delayedBroadcast({ type: 'getInbox_response', success: true, devices: [], requestId: message.requestId });
          return;
        }
        if (message.type === 'getInterfaces') {
          delayedBroadcast({
            type: 'getInterfaces_response',
            success: true,
            interfaces: ['HmIP-RF', 'BidCos-RF'],
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'getServiceMessages') {
          delayedBroadcast({
            type: 'getServiceMessages_response',
            messages: serviceMessages,
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'acknowledgeServiceMessage') {
          serviceMessages = serviceMessages.filter((m) => m.id !== message.id);
          delayedBroadcast({ type: 'acknowledgeServiceMessage_response', success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getAlarmMessages') {
          delayedBroadcast({ type: 'getAlarmMessages_response', alarms, requestId: message.requestId });
          return;
        }

        if (message.type === 'acknowledgeAlarmMessage') {
          alarms = alarms.filter((a) => a.id !== message.id);
          delayedBroadcast({ type: 'acknowledgeAlarmMessage_response', success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getSysvars') {
          delayedBroadcast({ type: 'getSysvars_response', success: true, sysvars, requestId: message.requestId });
          return;
        }

        if (message.type === 'getPrograms') {
          delayedBroadcast({ type: 'getPrograms_response', success: true, programs, requestId: message.requestId });
          return;
        }

        if (message.type === 'setSysvar' || message.type === 'runProgram') {
          const sysvar = sysvars.find((sv) => sv.id === message.id);
          if (sysvar && message.type === 'setSysvar') sysvar.value = message.value as boolean;
          delayedBroadcast({ type: `${message.type}_response`, success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getSystemInfo') {
          delayedBroadcast({
            type: 'getSystemInfo_response',
            success: true,
            addonVersion: '1.0.0',
            firmwareVersion: '3.83.6',
            radioInterfaces: [],
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'getDiagrams') {
          delayedBroadcast({ type: 'getDiagrams_response', diagrams: [], requestId: message.requestId });
          return;
        }

        if (message.type === 'getLayout') {
          delayedBroadcast({
            type: 'getLayout_response',
            layout: layouts[String(message.id)] ?? '',
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'setLayout') {
          layouts[String(message.id)] = message.layout as string;
          delayedBroadcast({ type: 'setLayout_response', success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getDeviceImages') {
          delayedBroadcast({ type: 'getDeviceImages_response', images: {}, requestId: message.requestId });
          return;
        }

        if (message.type === 'getRules') {
          delayedBroadcast({ type: 'getRules_response', rules, requestId: message.requestId });
          return;
        }

        if (message.type === 'saveRule') {
          const rule = { ...(message.rule as AnyPayload) };
          if (!rule.id) rule.id = `rule-${rules.length + 1}`;
          const index = rules.findIndex((r) => r.id === rule.id);
          if (index >= 0) rules[index] = rule;
          else rules.push(rule);
          delayedBroadcast({ type: 'saveRule_response', success: true, rule, requestId: message.requestId });
          return;
        }

        if (message.type === 'deleteRule') {
          rules = rules.filter((r) => r.id !== message.id);
          delayedBroadcast({ type: 'deleteRule_response', success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getPush') {
          delayedBroadcast({
            type: 'getPush_response',
            publicKey: 'BMockVapidPublicKeyOnlyForTheMockedWebSocketServer000000000000000000000000000000000000',
            subscribed: false,
            alarms: false,
            service: false,
            rules: false,
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'subscribePush' || message.type === 'unsubscribePush' || message.type === 'testPush') {
          delayedBroadcast({ type: `${message.type}_response`, success: true, requestId: message.requestId });
          return;
        }

        if (message.type === 'getFavorites') {
          delayedBroadcast({ type: 'getFavorites_response', favorites, requestId: message.requestId });
          return;
        }

        if (
          ['createFavorite', 'renameFavorite', 'deleteFavorite', 'addFavoriteItem', 'removeFavoriteItem'].includes(
            message.type,
          )
        ) {
          const response: AnyPayload = {
            type: `${message.type}_response`,
            success: true,
            requestId: message.requestId,
          };
          const list = favorites.find((f) => f.id === message.id);
          if (message.type === 'createFavorite') {
            response.id = nextFavoriteId++;
            favorites = [...favorites, { id: response.id as number, name: message.name as string, items: [] }];
          } else if (message.type === 'deleteFavorite') {
            favorites = favorites.filter((f) => f !== list);
          } else if (list && message.type === 'renameFavorite') {
            list.name = message.name as string;
          } else if (list) {
            const itemId = message.itemId as number;
            list.items = list.items.filter((item) => item.id !== itemId);
            if (message.type === 'addFavoriteItem') {
              const type = sysvars.some((sv) => sv.id === itemId)
                ? 'SYSVAR'
                : programs.some((p) => p.id === itemId)
                  ? 'PROGRAM'
                  : 'CHANNEL';
              list.items.push({ id: itemId, type });
            }
          }
          delayedBroadcast(response);
          return;
        }

        if (message.type === 'getDeviceProblems') {
          delayedBroadcast({ type: 'deviceProblems', devices: deviceProblems, requestId: message.requestId });
          return;
        }

        if (message.type === 'getDeviceHealth') {
          delayedBroadcast({ type: 'getDeviceHealth_response', devices: deviceHealth, requestId: message.requestId });
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
          delayedBroadcast({
            channels: allChannels(),
            deviceId: message.deviceId,
            all: true,
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'getChannels' && message.favoriteId) {
          const ids = new Set(favorites.find((f) => String(f.id) === message.favoriteId)?.items.map((item) => item.id));
          delayedBroadcast({
            channels: allChannels().filter((channel) => ids.has(channel.id as number)),
            deviceId: message.deviceId,
            favoriteId: message.favoriteId,
            requestId: message.requestId,
          });
          return;
        }

        if (message.type === 'getChannels') {
          const channels = message.roomId
            ? (roomChannels[message.roomId] ?? [])
            : (tradeChannels[message.tradeId ?? ''] ?? []);

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
          state.subscriptions = Array.isArray(message.channels) ? message.channels : [];
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
              ? {
                  type: 'paramsetDescription',
                  requestId: message.requestId,
                  address: message.address,
                  paramsetKey: message.paramsetKey,
                  description,
                }
              : {
                  type: 'error',
                  error: 'getParamsetDescription failed: Unknown paramset',
                  requestId: message.requestId,
                },
          );
          return;
        }

        // MASTER values: the tilt sensor reports vibration (operation mode 1),
        if (message.type === 'getParamset') {
          // the filling level sensor sits in a vertical barrel, the meter sensor has an IEC sensor
          const master: Record<string, AnyPayload> = {
            '00199D89A1B2C8:1': { CHANNEL_OPERATION_MODE: 1 },
            'LEQ0000030:1': { CASE_DESIGN: 0, CASE_HIGH: 100, CASE_WIDTH: 100 },
            'LEQ0000031:1': { METER_TYPE: 3 },
          };
          const values = (message.paramsetKey === 'MASTER' && master[String(message.address)]) || {};
          delayedBroadcast({
            type: 'paramset',
            requestId: message.requestId,
            address: message.address,
            paramsetKey: message.paramsetKey,
            values,
          });
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
            delayedBroadcast(
              eventMessage({ channel: message.channel, datapoint: message.datapoint, value: message.value }),
            );
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
          broadcast(eventMessage(event));
        },
        sentMessages: () => state.sentMessages,
        subscriptions: () => state.subscriptions,
        failNextSet: (code: string) => {
          state.failNextSet = code;
        },
        setAlarms: (next: AnyPayload[]) => {
          alarms = next;
        },
        // A system variable changed in the CCU: the server sends the list
        setSysvar: (id: number, value: unknown) => {
          const sysvar = sysvars.find((sv) => sv.id === id);
          if (sysvar) (sysvar as { value: unknown }).value = value;
          broadcast({ type: 'sysvars', sysvars });
        },
      };
    },
    {
      requireLogin: options.requireLogin === true,
      validToken: VALID_TOKEN,
      lite: options.lite === true,
      sessionExpired: options.sessionExpired === true,
    },
  );
};
