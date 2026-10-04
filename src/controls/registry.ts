import { ComponentType } from 'react';
import { Channel, ChannelType } from '../types/types';
import { FloorControl } from './FloorControl';
import { SwitchControl } from './SwitchControl';
import { BlindsControl } from './BlindsControl';
import { ThermostatControl } from './ThermostatControl';
import { DoorControl, DoorLockControl } from './DoorControl';
import { EnergyMeterControl } from './EnergyMeterControl';
import { WindowControl } from './WindowControl';
import { ClimateSensorControl } from './ClimateSensorControl';
import { DimmerControl } from './DimmerControl';
import { ColorLightControl } from './ColorLightControl';
import { ButtonsControl } from './ButtonsControl';
import { MotionDetectorControl, SirenControl, SmokeDetectorControl, WaterDetectorControl } from './DetectorControls';
import { GarageDoorControl } from './GarageDoorControl';
import { AccessControl, AccessPointControl } from './AccessControls';
import { InputControl } from './InputControl';
import { ServoControl } from './ServoControl';
import { SwitchControl as AlarmOutputControl } from './SwitchControl';
import { AutoRelockControl, DoorStateControl, FloorOutputControl, LockStateControl } from './SideChannelControls';
import {
  BrightnessControl,
  Co2Control,
  Co2LevelControl,
  ParticulateMatterControl,
  PowerMainsControl,
  RainSensorControl,
  SoilMoistureControl,
  TiltSensorControl,
} from './SensorControls';
import {
  AkkuControl,
  FlowMeterControl,
  ValveControl,
  WaterFlowControl,
  WaterPressureControl,
  WaterSwitchControl,
  WindowDriveControl,
  WinmaticControl,
} from './WaterControls';

// Sections of the dashboard, in the order they are shown
export type SectionId =
  | 'climate'
  | 'floor'
  | 'lights'
  | 'blinds'
  | 'windows'
  | 'doors'
  | 'security'
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
  ) & { section: SectionId };

const channelControl = <T extends Channel>(
  section: SectionId,
  component: ComponentType<{ channel: T }>,
): ControlOverride => ({
  per: 'channel',
  section,
  component: component as ComponentType<{ channel: Channel }>,
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
  UNIVERSAL_LIGHT_RECEIVER: channelControl('lights', ColorLightControl),
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
  [ChannelType.ENERGIE_METER_TRANSMITTER]: deviceControl('energy', EnergyMeterControl),
  // BidCos metering plugs (HM-ES-PMSw1): POWER and ENERGY_COUNTER as well
  POWERMETER: deviceControl('energy', EnergyMeterControl),
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
  // Irrigation (switch.fn CreateWaterSwitch, flow_meter_transmitter.fn) and
  // the water safety system HmIP-WSS
  WATER_SWITCH_VIRTUAL_RECEIVER: channelControl('water', WaterSwitchControl),
  FLOW_METER_TRANSMITTER: channelControl('water', FlowMeterControl),
  WATER_FLOW_TRANSMITTER: channelControl('water', WaterFlowControl),
  WATER_PRESSURE_TRANSMITTER: channelControl('water', WaterPressureControl),
  VALVE_ACTUATOR_RECEIVER: channelControl('water', ValveControl),
  // The alarm output of the HmIP-WSS (channel 3: STATE; the WebUI has no
  // control for it, datapointconfigurator.fn)
  ALARM_ACTUATOR_RECEIVER: channelControl('water', AlarmOutputControl),
  // Servo controllers HmIP-WSC (servo.fn)
  SERVO_VIRTUAL_RECEIVER: channelControl('drives', ServoControl),
  SERVO_TRANSMITTER: channelControl('drives', ServoControl),
  // Vibration, position and tilt (acceleration_transceiver.fn), mains failure
  ACCELERATION_TRANSCEIVER: channelControl('security', TiltSensorControl),
  POWER_MAINS_TRANSMITTER: channelControl('security', PowerMainsControl),
  [ChannelType.KEY_TRANSCEIVER]: deviceControl('buttons', ButtonsControl),
  KEY: deviceControl('buttons', ButtonsControl),
  VIRTUAL_KEY: deviceControl('buttons', ButtonsControl),
  // Inputs set up as key, switch or contact (hmipChannelConfigDialogs.tcl)
  MULTI_MODE_INPUT_TRANSMITTER: channelControl('inputs', InputControl),
  ACCESS_TRANSCEIVER: deviceControl('security', AccessControl),
  ACCESSPOINT_GENERIC_RECEIVER: deviceControl('system', AccessPointControl),
};
