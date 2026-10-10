import { LightsStat, TemperatureStat, WindowsStat } from './OverviewStats';
import type { ReactNode } from 'react';
import type { Channel } from '../types/types';
import { controlOverrides } from '../controls/registry';
import { windowState } from '../controls/WindowControl';
import { isLight, useLightTradeIds } from '../controls/light/isLight';

// --- Overview: a few figures across the shown channels

const windowTypes = new Set([
  'SHUTTER_CONTACT',
  'SHUTTER_CONTACT_TRANSCEIVER',
  'ROTARY_HANDLE_SENSOR',
  'ROTARY_HANDLE_TRANSCEIVER',
]);

const isOpenWindow = (channel: Channel) =>
  windowTypes.has(channel.type) && ['open', 'tilted'].includes(windowState(channel));

// Dimmers of the "lights" section, and the switches among them that drive
// a lamp as their tile shows it (isLight: pumps and heaters don't count);
// on when STATE or LEVEL say so
const countsAsLight = (channel: Channel, lightTradeIds: Set<number>) => {
  if (controlOverrides[channel.type]?.section !== 'lights') return false;
  const dp = channel.datapoints as Record<string, unknown>;
  return 'LEVEL' in dp || isLight(channel, lightTradeIds);
};

export const isLightOn = (channel: Channel, lightTradeIds: Set<number>) => {
  if (!countsAsLight(channel, lightTradeIds)) return false;
  const dp = channel.datapoints as Record<string, unknown>;
  return dp.STATE === true || (typeof dp.LEVEL === 'number' && dp.LEVEL > 0) || Number(dp.LEVEL) > 0;
};

export const Overview = ({ channels }: { channels: Channel[] }) => {
  const reachable = channels.filter((c) => !c.status?.UNREACH);
  const temperatures = reachable
    .filter((c) => controlOverrides[c.type]?.section === 'climate')
    .map((c) => (c.datapoints as Record<string, unknown>).ACTUAL_TEMPERATURE)
    .filter((t): t is number => typeof t === 'number');
  const lightTradeIds = useLightTradeIds();
  const switches = channels.filter((c) => countsAsLight(c, lightTradeIds));
  const switchedOn = switches.filter((c) => isLightOn(c, lightTradeIds)).length;
  const windowChannels = channels.filter((c) => windowTypes.has(c.type));
  const openWindows = windowChannels.filter(isOpenWindow);

  const stats: ReactNode[] = [];
  if (temperatures.length > 0) {
    const average = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
    stats.push(<TemperatureStat key="temp" index={stats.length} average={average} />);
  }
  if (switches.length > 0) {
    stats.push(<LightsStat key="lights" index={stats.length} on={switchedOn} total={switches.length} />);
  }
  if (windowChannels.length > 0) {
    stats.push(<WindowsStat key="windows" index={stats.length} open={openWindows.map((c) => c.name)} />);
  }
  if (stats.length === 0) {
    return null;
  }
  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">{stats}</section>;
};
