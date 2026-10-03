import { getLocale } from '../../paraglide/runtime';

// Readable names and groups for the settings (MASTER parameters) devices
// commonly have. The CCU only gives technical names; these follow the
// wording of the WebUI where it has one.

export type ParameterGroup = 'operation' | 'heating' | 'switching' | 'radio' | 'other' | 'schedule' | 'expert' | 'hidden';

type Entry = { group: ParameterGroup; de: string; en: string };

const entry = (group: ParameterGroup, de: string, en: string): Entry => ({ group, de, en });

const catalog: Record<string, Entry> = {
  // Heating
  TEMPERATURE_OFFSET: entry('heating', 'Temperatur-Offset', 'Temperature offset'),
  BOOST_TIME_PERIOD: entry('heating', 'Boost-Dauer', 'Boost duration'),
  BOOST_POSITION: entry('heating', 'Ventilöffnung bei Boost', 'Valve opening during boost'),
  BOOST_AFTER_WINDOW_OPEN: entry('heating', 'Boost nach Fenster offen', 'Boost after window open'),
  FROST_PROTECTION_TEMPERATURE: entry('heating', 'Frostschutztemperatur', 'Frost protection temperature'),
  TEMPERATURE_WINDOW_OPEN: entry('heating', 'Fenster-offen-Temperatur', 'Window open temperature'),
  TEMPERATURE_COMFORT: entry('heating', 'Komforttemperatur', 'Comfort temperature'),
  TEMPERATURE_LOWERING: entry('heating', 'Absenktemperatur', 'Lowering temperature'),
  TEMPERATURE_MINIMUM: entry('heating', 'Minimale Solltemperatur', 'Minimum target temperature'),
  TEMPERATURE_MAXIMUM: entry('heating', 'Maximale Solltemperatur', 'Maximum target temperature'),
  ADAPTIVE_REGULATION: entry('heating', 'Adaptive Regelung', 'Adaptive regulation'),
  OPTIMUM_START_STOP: entry('heating', 'Optimum Start/Stop', 'Optimum start/stop'),
  DECALCIFICATION_TIME: entry('heating', 'Entkalkung: Uhrzeit', 'Decalcification: time'),
  DECALCIFICATION_WEEKDAY: entry('heating', 'Entkalkung: Wochentag', 'Decalcification: weekday'),
  HEATING_COOLING: entry('heating', 'Heizen oder Kühlen', 'Heating or cooling'),
  HEATING_ENABLE: entry('heating', 'Heizen erlauben', 'Allow heating'),
  COOLING_ENABLE: entry('heating', 'Kühlen erlauben', 'Allow cooling'),
  HEATING_EMERGENCY_PWM_SIGNAL: entry('heating', 'Notbetrieb Heizen', 'Emergency operation heating'),
  COOLING_EMERGENCY_PWM_SIGNAL: entry('heating', 'Notbetrieb Kühlen', 'Emergency operation cooling'),
  HUMIDITY_LIMIT_VALUE: entry('heating', 'Grenzwert Luftfeuchte', 'Humidity limit'),
  MANU_MODE_PRIORITIZATION: entry('heating', 'Vorrang des Manuell-Modus', 'Priority of manual mode'),
  PARTY_MODE_PRIORITIZATION: entry('heating', 'Vorrang des Party-Modus', 'Priority of party mode'),
  MIN_MAX_VALUE_NOT_RELEVANT_FOR_MANU_MODE: entry('heating', 'Min./Max. im Manuell-Modus ignorieren', 'Ignore min./max. in manual mode'),
  CLIMATE_FUNCTION: entry('heating', 'Klimafunktion', 'Climate function'),
  AUTO_HYDRAULIC_ADJUSTMENT: entry('heating', 'Automatischer hydraulischer Abgleich', 'Automatic hydraulic balancing'),
  PWM_AT_LOW_VALVE_POSITION: entry('heating', 'PWM bei kleiner Ventilöffnung', 'PWM at low valve position'),
  OVERTEMP_LEVEL: entry('heating', 'Grenze Übertemperatur', 'Overtemperature limit'),
  VALVE_OFFSET: entry('heating', 'Ventil-Offset', 'Valve offset'),
  VALVE_MAXIMUM_POSITION: entry('heating', 'Maximale Ventilöffnung', 'Maximum valve opening'),
  TEMPERATURE_COMFORT_COOLING: entry('heating', 'Komforttemperatur Kühlen', 'Comfort temperature cooling'),
  TEMPERATURE_LOWERING_COOLING: entry('heating', 'Absenktemperatur Kühlen', 'Lowering temperature cooling'),
  TEMPERATURE_WINDOW_OPEN_COOLING: entry('heating', 'Fenster-offen-Temperatur Kühlen', 'Window open temperature cooling'),
  TWO_POINT_HYSTERESIS: entry('heating', 'Zweipunkt-Hysterese', 'Two-point hysteresis'),
  TWO_POINT_HYSTERESIS_HUMIDITY: entry('heating', 'Zweipunkt-Hysterese Luftfeuchte', 'Two-point hysteresis humidity'),
  DURATION_5MIN: entry('heating', 'Dauer in 5-Minuten-Schritten', 'Duration in 5 minute steps'),
  // Operation and display
  BACKLIGHT_ON_TIME: entry('operation', 'Displaybeleuchtung: Dauer', 'Display backlight: duration'),
  DISPLAY_CONTRAST: entry('operation', 'Display-Kontrast', 'Display contrast'),
  SHOW_HUMIDITY: entry('operation', 'Luftfeuchte anzeigen', 'Show humidity'),
  SHOW_SET_TEMPERATURE: entry('operation', 'Solltemperatur anzeigen', 'Show target temperature'),
  BUTTON_RESPONSE_WITHOUT_BACKLIGHT: entry('operation', 'Tasten reagieren ohne Beleuchtung', 'Buttons react without backlight'),
  GLOBAL_BUTTON_LOCK: entry('operation', 'Bediensperre', 'Button lock'),
  KEYPRESS_SIGNAL: entry('operation', 'Tastenton', 'Key press sound'),
  LED_DISABLE_CHANNELSTATE: entry('operation', 'Status-LED aus', 'Status LED off'),
  LED_FLASH_LOCKED: entry('operation', 'LED blinkt bei verriegelt', 'LED flashes when locked'),
  LED_FLASH_UNLOCKED: entry('operation', 'LED blinkt bei entriegelt', 'LED flashes when unlocked'),
  DBL_PRESS_TIME: entry('operation', 'Zeit für Doppelklick', 'Double press time'),
  LONG_PRESS_TIME: entry('operation', 'Zeit für langen Tastendruck', 'Long press time'),
  REPEATED_LONG_PRESS_TIMEOUT_VALUE: entry('operation', 'Langer Tastendruck: Wiederholung (Wert)', 'Repeated long press (value)'),
  REPEATED_LONG_PRESS_TIMEOUT_UNIT: entry('operation', 'Langer Tastendruck: Wiederholung (Einheit)', 'Repeated long press (unit)'),
  // Switching and moving
  POWERUP_JUMPTARGET: entry('switching', 'Verhalten nach Stromausfall', 'Behaviour after power failure'),
  ON_TIME_BASE: entry('switching', 'Einschaltdauer (Basis)', 'On time (base)'),
  ON_TIME_FACTOR: entry('switching', 'Einschaltdauer (Faktor)', 'On time (factor)'),
  ON_MIN_LEVEL: entry('switching', 'Minimaler Einschaltwert', 'Minimum on level'),
  REFERENCE_RUNNING_TIME_BOTTOM_TOP_VALUE: entry('switching', 'Fahrzeit unten → oben (Wert)', 'Running time bottom → top (value)'),
  REFERENCE_RUNNING_TIME_BOTTOM_TOP_UNIT: entry('switching', 'Fahrzeit unten → oben (Einheit)', 'Running time bottom → top (unit)'),
  REFERENCE_RUNNING_TIME_TOP_BOTTOM_VALUE: entry('switching', 'Fahrzeit oben → unten (Wert)', 'Running time top → bottom (value)'),
  REFERENCE_RUNNING_TIME_TOP_BOTTOM_UNIT: entry('switching', 'Fahrzeit oben → unten (Einheit)', 'Running time top → bottom (unit)'),
  REFERENCE_RUNNING_TIME_SLATS_VALUE: entry('switching', 'Fahrzeit Lamellen (Wert)', 'Slats running time (value)'),
  REFERENCE_RUNNING_TIME_SLATS_UNIT: entry('switching', 'Fahrzeit Lamellen (Einheit)', 'Slats running time (unit)'),
  REFERENCE_RUN_COUNTER: entry('switching', 'Fahrten bis zur Referenzfahrt', 'Runs until reference run'),
  CHANGE_OVER_DELAY: entry('switching', 'Pause beim Richtungswechsel', 'Pause on direction change'),
  DELAY_COMPENSATION: entry('switching', 'Verzögerungsausgleich', 'Delay compensation'),
  POSITION_SAVE_TIME: entry('switching', 'Zeit bis zum Speichern der Position', 'Time until the position is saved'),
  ANGLE_MAX: entry('switching', 'Lamellenwinkel maximal', 'Maximum slat angle'),
  ANGLE_OPEN: entry('switching', 'Lamellenwinkel offen', 'Open slat angle'),
  ANGLE_LOCKED: entry('switching', 'Lamellenwinkel gesperrt', 'Locked slat angle'),
  OUTPUT_SWAP: entry('switching', 'Ausgänge tauschen', 'Swap outputs'),
  LOGIC_COMBINATION: entry('switching', 'Verknüpfungslogik', 'Logic combination'),
  LOGIC_COMBINATION_2: entry('switching', 'Verknüpfungslogik 2', 'Logic combination 2'),
  EVENT_DELAY_VALUE: entry('switching', 'Entprellzeit (Wert)', 'Event delay (value)'),
  EVENT_DELAY_UNIT: entry('switching', 'Entprellzeit (Einheit)', 'Event delay (unit)'),
  EVENT_RANDOMTIME_VALUE: entry('switching', 'Zufallsverzögerung (Wert)', 'Random delay (value)'),
  EVENT_RANDOMTIME_UNIT: entry('switching', 'Zufallsverzögerung (Einheit)', 'Random delay (unit)'),
  CHANNEL_OPERATION_MODE: entry('switching', 'Kanalfunktion', 'Channel function'),
  MSG_FOR_POS_A: entry('switching', 'Meldung bei Stellung A', 'Message for position A'),
  MSG_FOR_POS_B: entry('switching', 'Meldung bei Stellung B', 'Message for position B'),
  MSG_FOR_POS_C: entry('switching', 'Meldung bei Stellung C', 'Message for position C'),
  METER_CONSTANT_ENERGY: entry('switching', 'Zählerkonstante Energie', 'Meter constant energy'),
  METER_CONSTANT_VOLUME: entry('switching', 'Zählerkonstante Volumen', 'Meter constant volume'),
  METER_OBIS_SEARCH_STRING: entry('switching', 'OBIS-Suchtext', 'OBIS search string'),
  // Radio and system
  CYCLIC_INFO_MSG: entry('radio', 'Zyklische Statusmeldung', 'Cyclic status message'),
  CYCLIC_INFO_MSG_DIS: entry('radio', 'Zyklische Statusmeldung: Intervall', 'Cyclic status message: interval'),
  CYCLIC_INFO_MSG_DIS_UNCHANGED: entry('radio', 'Zyklische Statusmeldung: bei unverändertem Wert', 'Cyclic status message: unchanged value'),
  CYCLIC_INFO_MSG_OVERDUE_THRESHOLD: entry('radio', 'Ausbleibende Meldungen bis „nicht erreichbar“', 'Missed messages until unreachable'),
  CYCLIC_BIDI_INFO_MSG_DISCARD_FACTOR: entry('radio', 'Bidirektionale Meldungen verwerfen (Faktor)', 'Discard bidirectional messages (factor)'),
  CYCLIC_BIDI_INFO_MSG_DISCARD_VALUE: entry('radio', 'Bidirektionale Meldungen verwerfen (Wert)', 'Discard bidirectional messages (value)'),
  ARR_TIMEOUT: entry('radio', 'Wartezeit auf Antwort', 'Response timeout'),
  DUTYCYCLE_LIMIT: entry('radio', 'Duty-Cycle-Grenze', 'Duty cycle limit'),
  ENABLE_ROUTING: entry('radio', 'Routing', 'Routing'),
  LOCAL_RESET_DISABLED: entry('radio', 'Werksreset am Gerät sperren', 'Disable factory reset at the device'),
  LOW_BAT_LIMIT: entry('radio', 'Grenze „Batterie schwach“', 'Low battery limit'),
  DISABLE_MSG_TO_AC: entry('radio', 'Keine Meldungen an den Zugangspunkt', 'No messages to the access point'),
  BLOCKING_ON_SABOTAGE: entry('radio', 'Sperre bei Sabotage', 'Block on sabotage'),
  DAYLIGHT_SAVINGS_TIME: entry('radio', 'Sommerzeit automatisch umstellen', 'Switch to daylight saving time'),
  DST_START_MONTH: entry('radio', 'Sommerzeit Beginn: Monat', 'DST start: month'),
  DST_START_DAY_OF_WEEK: entry('radio', 'Sommerzeit Beginn: Wochentag', 'DST start: weekday'),
  DST_START_WEEK_OF_MONTH: entry('radio', 'Sommerzeit Beginn: Woche', 'DST start: week'),
  DST_START_TIME: entry('radio', 'Sommerzeit Beginn: Uhrzeit', 'DST start: time'),
  DST_END_MONTH: entry('radio', 'Sommerzeit Ende: Monat', 'DST end: month'),
  DST_END_DAY_OF_WEEK: entry('radio', 'Sommerzeit Ende: Wochentag', 'DST end: weekday'),
  DST_END_WEEK_OF_MONTH: entry('radio', 'Sommerzeit Ende: Woche', 'DST end: week'),
  DST_END_TIME: entry('radio', 'Sommerzeit Ende: Uhrzeit', 'DST end: time'),
  UTC_OFFSET: entry('radio', 'Zeitzone: Abstand zu UTC', 'Time zone: offset to UTC'),
  UTC_DST_OFFSET: entry('radio', 'Zeitzone: Abstand zu UTC im Sommer', 'Time zone: DST offset to UTC'),
  LATITUDE: entry('radio', 'Breitengrad', 'Latitude'),
  LONGITUDE: entry('radio', 'Längengrad', 'Longitude'),
};

const groupRules: [RegExp, ParameterGroup][] = [
  [/^P\d+_(ENDTIME|TEMPERATURE)_/, 'hidden'],
  // The actuators' own week program: edited in WeekProgramSheet
  [/^\d+_WP_/, 'hidden'],
  [/^(ROUTER_|MULTICAST_|BACKBONE_)/, 'expert'],
  [/^(CYCLIC_|DST_|DUTY|ARR_|ROUTING|LOW_BAT|LOCAL_RESET|DAYLIGHT)/, 'radio'],
  [/^(POWERUP_|ON_TIME|REFERENCE_|ANGLE_|EVENT_|LOGIC_|OUTPUT_)/, 'switching'],
  [/(TEMPERATURE|HEATING|COOLING|BOOST|VALVE|DECALC|HUMIDITY)/, 'heating'],
  [/(BACKLIGHT|DISPLAY|BUTTON|LED_|KEYPRESS|_PRESS_)/, 'operation'],
];

export const parameterGroup = (name: string): ParameterGroup =>
  catalog[name]?.group ?? groupRules.find(([pattern]) => pattern.test(name))?.[1] ?? 'other';

// "BACKLIGHT_ON_TIME" → "Backlight on time"
export const humanize = (name: string) => {
  const words = name.toLowerCase().replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The readable name of a parameter: from the catalog, else the technical
// name made readable
export const parameterLabel = (name: string) => {
  const known = catalog[name];
  if (known) {
    return getLocale() === 'de' ? known.de : known.en;
  }
  return humanize(name);
};

export const GROUP_ORDER: ParameterGroup[] = ['operation', 'heating', 'switching', 'radio', 'other', 'schedule', 'expert'];
