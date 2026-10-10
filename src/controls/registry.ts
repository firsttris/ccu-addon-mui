import { ComponentType, lazy } from 'react';
import { Channel, ChannelType } from '../types/types';

// The tiles are loaded when a page shows one, not with the app: they are
// most of its code, and a room with lights only needs the light tiles.
// Each module is loaded once, by whichever of its tiles comes first.
// The props differ per tile; channelControl and deviceControl say which
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTile = ComponentType<any>;
// tileName: which tile it is, for tests and debugging
const tile = (load: () => Promise<Record<string, unknown>>, name: string): AnyTile & { tileName: string } =>
  Object.assign(
    lazy(async () => ({ default: (await load())[name] as AnyTile })),
    { tileName: name },
  );

const FloorControl = tile(() => import('./FloorControl'), 'FloorControl');
const SwitchControl = tile(() => import('./SwitchControl'), 'SwitchControl');
const BlindsControl = tile(() => import('./BlindsControl'), 'BlindsControl');
const ThermostatControl = tile(() => import('./ThermostatControl'), 'ThermostatControl');
const DoorControl = tile(() => import('./DoorControl'), 'DoorControl');
const DoorLockControl = tile(() => import('./DoorControl'), 'DoorLockControl');
const EnergyMeterControl = tile(() => import('./EnergyMeterControl'), 'EnergyMeterControl');
const WindowControl = tile(() => import('./WindowControl'), 'WindowControl');
const ClimateSensorControl = tile(() => import('./ClimateSensorControl'), 'ClimateSensorControl');
const DimmerControl = tile(() => import('./DimmerControl'), 'DimmerControl');
const DualWhiteColorControl = tile(() => import('./BidcosLightControls'), 'DualWhiteColorControl');
const RgbwColorControl = tile(() => import('./BidcosLightControls'), 'RgbwColorControl');
const RgbwProgramControl = tile(() => import('./BidcosLightControls'), 'RgbwProgramControl');
const AcousticSignalControl = tile(() => import('./SoundControls'), 'AcousticSignalControl');
const SignalControl = tile(() => import('./SoundControls'), 'SignalControl');
const ColorLightControl = tile(() => import('./ColorLightControl'), 'ColorLightControl');
const ButtonsControl = tile(() => import('./ButtonsControl'), 'ButtonsControl');
const MotionDetectorControl = tile(() => import('./DetectorControls'), 'MotionDetectorControl');
const SirenControl = tile(() => import('./DetectorControls'), 'SirenControl');
const SmokeDetectorControl = tile(() => import('./DetectorControls'), 'SmokeDetectorControl');
const WaterDetectorControl = tile(() => import('./DetectorControls'), 'WaterDetectorControl');
const GarageDoorControl = tile(() => import('./GarageDoorControl'), 'GarageDoorControl');
const AccessControl = tile(() => import('./AccessControls'), 'AccessControl');
const AccessPointControl = tile(() => import('./AccessControls'), 'AccessPointControl');
const InputControl = tile(() => import('./InputControl'), 'InputControl');
const ServoControl = tile(() => import('./ServoControl'), 'ServoControl');
const AcousticDisplayControl = tile(() => import('./DisplayControls'), 'AcousticDisplayControl');
const Rc19DisplayControl = tile(() => import('./DisplayControls'), 'Rc19DisplayControl');
const DistanceControl = tile(() => import('./MeterSensorControls'), 'DistanceControl');
const FillingLevelControl = tile(() => import('./MeterSensorControls'), 'FillingLevelControl');
const MeterSensorControl = tile(() => import('./MeterSensorControls'), 'MeterSensorControl');
const PassageDetectorControl = tile(() => import('./MeterSensorControls'), 'PassageDetectorControl');
const AutoRelockControl = tile(() => import('./SideChannelControls'), 'AutoRelockControl');
const DoorStateControl = tile(() => import('./SideChannelControls'), 'DoorStateControl');
const FloorOutputControl = tile(() => import('./SideChannelControls'), 'FloorOutputControl');
const LockStateControl = tile(() => import('./SideChannelControls'), 'LockStateControl');
const BrightnessControl = tile(() => import('./SensorControls'), 'BrightnessControl');
const Co2Control = tile(() => import('./SensorControls'), 'Co2Control');
const Co2LevelControl = tile(() => import('./SensorControls'), 'Co2LevelControl');
const ParticulateMatterControl = tile(() => import('./SensorControls'), 'ParticulateMatterControl');
const PowerMainsControl = tile(() => import('./SensorControls'), 'PowerMainsControl');
const RainSensorControl = tile(() => import('./SensorControls'), 'RainSensorControl');
const SoilMoistureControl = tile(() => import('./SensorControls'), 'SoilMoistureControl');
const TiltSensorControl = tile(() => import('./SensorControls'), 'TiltSensorControl');
const AkkuControl = tile(() => import('./WaterControls'), 'AkkuControl');
const FlowMeterControl = tile(() => import('./WaterControls'), 'FlowMeterControl');
const ValveControl = tile(() => import('./WaterControls'), 'ValveControl');
const WaterFlowControl = tile(() => import('./WaterControls'), 'WaterFlowControl');
const WaterPressureControl = tile(() => import('./WaterControls'), 'WaterPressureControl');
const WaterSwitchControl = tile(() => import('./WaterControls'), 'WaterSwitchControl');
const WindowDriveControl = tile(() => import('./WaterControls'), 'WindowDriveControl');
const WinmaticControl = tile(() => import('./WaterControls'), 'WinmaticControl');

// Sections of the dashboard, in the order they are shown
export type SectionId =
  | 'climate'
  | 'floor'
  | 'lights'
  | 'blinds'
  | 'windows'
  | 'doors'
  | 'security'
  | 'signals'
  | 'sensors'
  | 'water'
  | 'drives'
  | 'buttons'
  | 'inputs'
  | 'energy'
  | 'system';

// Hand-made controls for common channel types. They refine the generic
// renderer (GenericControl), which every other type falls back to.
export type ControlOverride =
  // One tile per channel
  (
    | { per: 'channel'; component: ComponentType<{ channel: Channel }> }
    // One tile for all channels of a device of this type (e.g. the four
    // channels of an energy meter)
    | { per: 'device'; component: ComponentType<{ channels: Channel[] }> }
  ) & {
    section: SectionId;
    // Two columns of the section's grid (col-span-2 on the tile), e.g. a
    // light with a color picker; arranged tiles start as wide
    wide?: boolean;
  };

const channelControl = <T extends Channel>(
  section: SectionId,
  component: ComponentType<{ channel: T }>,
  { wide = false } = {},
): ControlOverride => ({
  per: 'channel',
  section,
  component: component as ComponentType<{ channel: Channel }>,
  wide,
});

const deviceControl = <T extends Channel>(
  section: SectionId,
  component: ComponentType<{ channels: T[] }>,
): ControlOverride => ({
  per: 'device',
  section,
  component: component as ComponentType<{ channels: Channel[] }>,
});

export const controlOverrides: Partial<Record<string, ControlOverride>> = {
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: channelControl('climate', ThermostatControl),
  // BidCos radiator and wall thermostats (HM-CC-RT-DN, HM-TC-IT-WM)
  CLIMATECONTROL_RT_TRANSCEIVER: channelControl('climate', ThermostatControl),
  THERMALCONTROL_TRANSMIT: channelControl('climate', ThermostatControl),
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: channelControl('floor', FloorControl),
  // Pump and direct output of floor heating controllers
  CLIMATECONTROL_FLOOR_PUMP_TRANSCEIVER: channelControl('floor', FloorOutputControl),
  CLIMATECONTROL_FLOOR_DIRECT_TRANSMITTER: channelControl('floor', FloorOutputControl),
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: channelControl('lights', SwitchControl),
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: channelControl('blinds', BlindsControl),
  // HmIP shutter actuators and the BidCos actuators work the same way
  SHUTTER_VIRTUAL_RECEIVER: channelControl('blinds', BlindsControl),
  BLIND: channelControl('blinds', BlindsControl),
  JALOUSIE: channelControl('blinds', BlindsControl),
  SWITCH: channelControl('lights', SwitchControl),
  DIMMER_VIRTUAL_RECEIVER: channelControl('lights', DimmerControl),
  DIMMER: channelControl('lights', DimmerControl),
  // The virtual channels of BidCos dimmers (expert channels in the WebUI's
  // channel chooser), backlights of wall thermostats and the status LEDs
  // of HmIP(W)-WRC6 and HCU, all dimmer.fn in the WebUI
  VIRTUAL_DIMMER: channelControl('lights', DimmerControl),
  BACKLIGHTING_RECEIVER: channelControl('system', DimmerControl),
  OPTICAL_SIGNAL_RECEIVER: channelControl('buttons', DimmerControl),
  UNIVERSAL_LIGHT_RECEIVER: channelControl('lights', ColorLightControl, { wide: true }),
  // BidCos LED controllers (rgbw.fn, dual_white_controller.fn): the
  // brightness of HM-LC-DW-WM is a dimmer, color and programs of the
  // HM-LC-RGBW-WM and the white mix have their own tiles
  DUAL_WHITE_BRIGHTNESS: channelControl('lights', DimmerControl),
  VIRTUAL_DUAL_WHITE_BRIGHTNESS: channelControl('lights', DimmerControl),
  DUAL_WHITE_COLOR: channelControl('lights', DualWhiteColorControl),
  VIRTUAL_DUAL_WHITE_COLOR: channelControl('lights', DualWhiteColorControl),
  RGBW_COLOR: channelControl('lights', RgbwColorControl, { wide: true }),
  RGBW_AUTOMATIC: channelControl('lights', RgbwProgramControl),
  [ChannelType.KEYMATIC]: channelControl('doors', DoorControl),
  DOOR_LOCK_STATE_TRANSMITTER: channelControl('doors', DoorLockControl),
  DOOR_LOCK_TRANSCEIVER: channelControl('doors', DoorLockControl),
  DOOR_RECEIVER: channelControl('doors', GarageDoorControl),
  // Door lock side channels (door_opener.fn): door state and auto relock of
  // the HmIP-DLP, lock state of the HmIP-DLS
  DOOR_STATE_TRANSCEIVER: channelControl('doors', DoorStateControl),
  AUTO_RELOCK_TRANSCEIVER: channelControl('doors', AutoRelockControl),
  DOOR_LOCK_STATE_TRANSCEIVER: channelControl('doors', LockStateControl),
  // Their users (accessreceiver.fn): HmIP-DLD, HmIP-DLP and HmIP-FDC
  ACCESS_RECEIVER: deviceControl('doors', AccessControl),
  PERMISSION_TRANSCEIVER: deviceControl('doors', AccessControl),
  SMOKE_DETECTOR: channelControl('security', SmokeDetectorControl),
  MOTION_DETECTOR: channelControl('security', MotionDetectorControl),
  // HmIP names, as in the WebUI's functions.fn and motiondetector.fn
  MOTIONDETECTOR_TRANSCEIVER: channelControl('security', MotionDetectorControl),
  MOTIONDETECTOR_VIRTUAL_TRANSCEIVER: channelControl('security', MotionDetectorControl),
  PRESENCEDETECTOR_TRANSCEIVER: channelControl('security', MotionDetectorControl),
  WATER_DETECTION_TRANSMITTER: channelControl('security', WaterDetectorControl),
  WATERDETECTIONSENSOR: channelControl('security', WaterDetectorControl),
  // HmIP-ASIR alarm sirens (the WebUI's alarmsirene.fn)
  ALARM_SWITCH_VIRTUAL_RECEIVER: channelControl('security', SirenControl),
  // MP3 player HmIP-MP3P (acoustic_signal.fn) and the BidCos chimes with
  // flash light HM-OU-CFM, -CF-Pl, -CM-PCB
  ACOUSTIC_SIGNAL_VIRTUAL_RECEIVER: channelControl('signals', AcousticSignalControl),
  SIGNAL_CHIME: channelControl('signals', SignalControl),
  SIGNAL_LED: channelControl('signals', SignalControl),
  [ChannelType.ENERGIE_METER_TRANSMITTER]: deviceControl('energy', EnergyMeterControl),
  // BidCos metering plugs (HM-ES-PMSw1): POWER and ENERGY_COUNTER as well
  POWERMETER: deviceControl('energy', EnergyMeterControl),
  // Meter sensor HM-ES-TX-WM (powermeter.fn)
  POWERMETER_IGL: channelControl('energy', MeterSensorControl),
  POWERMETER_IEC1: channelControl('energy', MeterSensorControl),
  POWERMETER_IEC2: channelControl('energy', MeterSensorControl),
  SHUTTER_CONTACT: channelControl('windows', WindowControl),
  SHUTTER_CONTACT_TRANSCEIVER: channelControl('windows', WindowControl),
  ROTARY_HANDLE_SENSOR: channelControl('windows', WindowControl),
  ROTARY_HANDLE_TRANSCEIVER: channelControl('windows', WindowControl),
  // Window drives (win_sc_sensor.fn, window.fn) and the Winmatic's battery
  WINDOW_DRIVE_RECEIVER: channelControl('windows', WindowDriveControl),
  WINMATIC: channelControl('windows', WinmaticControl),
  AKKU: channelControl('windows', AkkuControl),
  CLIMATE_TRANSCEIVER: channelControl('sensors', ClimateSensorControl),
  WEATHER_TRANSMIT: channelControl('sensors', ClimateSensorControl),
  WEATHER: channelControl('sensors', ClimateSensorControl),
  HEATING_ROOM_TH_TRANSCEIVER: channelControl('sensors', ClimateSensorControl),
  // Sensors as the WebUI's raindetector_transmitter.fn, brightness_transmitter.fn
  RAIN_DETECTION_TRANSMITTER: channelControl('sensors', RainSensorControl),
  BRIGHTNESS_TRANSMITTER: channelControl('sensors', BrightnessControl),
  LUXMETER: channelControl('sensors', BrightnessControl),
  CARBON_DIOXIDE_RECEIVER: channelControl('sensors', Co2Control),
  SENSOR_FOR_CARBON_DIOXIDE: channelControl('sensors', Co2LevelControl),
  TEMP_HUMIDITY_PARTICULATE_MATTER_TRANSMITTER: channelControl('sensors', ParticulateMatterControl),
  SOIL_MOISTURE_TRANSMITTER: channelControl('sensors', SoilMoistureControl),
  // distance_transmitter.fn, passagedetector.fn, capacitive_filling_level_sensor.fn
  DISTANCE_TRANSMITTER: channelControl('sensors', DistanceControl),
  PASSAGE_DETECTOR_DIRECTION_TRANSMITTER: deviceControl('sensors', PassageDetectorControl),
  CAPACITIVE_FILLING_LEVEL_SENSOR: channelControl('sensors', FillingLevelControl),
  // Irrigation (switch.fn CreateWaterSwitch, flow_meter_transmitter.fn) and
  // the water safety system HmIP-WSS
  WATER_SWITCH_VIRTUAL_RECEIVER: channelControl('water', WaterSwitchControl),
  FLOW_METER_TRANSMITTER: channelControl('water', FlowMeterControl),
  WATER_FLOW_TRANSMITTER: channelControl('water', WaterFlowControl),
  WATER_PRESSURE_TRANSMITTER: channelControl('water', WaterPressureControl),
  VALVE_ACTUATOR_RECEIVER: channelControl('water', ValveControl),
  // The alarm output of the HmIP-WSS (channel 3: STATE; the WebUI has no
  // control for it, datapointconfigurator.fn)
  ALARM_ACTUATOR_RECEIVER: channelControl('water', SwitchControl),
  // Servo controllers HmIP-WSC (servo.fn)
  SERVO_VIRTUAL_RECEIVER: channelControl('drives', ServoControl),
  SERVO_TRANSMITTER: channelControl('drives', ServoControl),
  // Vibration, position and tilt (acceleration_transceiver.fn), mains failure
  ACCELERATION_TRANSCEIVER: channelControl('security', TiltSensorControl),
  POWER_MAINS_TRANSMITTER: channelControl('security', PowerMainsControl),
  [ChannelType.KEY_TRANSCEIVER]: deviceControl('buttons', ButtonsControl),
  // Displays written by the CCU: HmIP-WRCD (acoustic_display_receiver.fn)
  // and HM-RC-19 (rc19_display.fn)
  ACOUSTIC_DISPLAY_RECEIVER: channelControl('buttons', AcousticDisplayControl),
  DISPLAY: channelControl('buttons', Rc19DisplayControl),
  KEY: deviceControl('buttons', ButtonsControl),
  // The keys of the HM-RC-19 for links to the CCU (rf_rc_19.xml: PRESS_SHORT, PRESS_LONG)
  CENTRAL_KEY: deviceControl('buttons', ButtonsControl),
  VIRTUAL_KEY: deviceControl('buttons', ButtonsControl),
  // Inputs set up as key, switch or contact (hmipChannelConfigDialogs.tcl)
  MULTI_MODE_INPUT_TRANSMITTER: channelControl('inputs', InputControl),
  ACCESS_TRANSCEIVER: deviceControl('security', AccessControl),
  ACCESSPOINT_GENERIC_RECEIVER: deviceControl('system', AccessPointControl),
};
