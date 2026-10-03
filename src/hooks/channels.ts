import { Channel, ChannelType, HmEvent } from '../types/types';

export type Value = string | number | boolean;

// Types with a control come first, in this order; all others follow
// alphabetically and are shown by GenericControl.
const typeOrder: Partial<Record<string, number>> = {
  [ChannelType.CLIMATECONTROL_FLOOR_TRANSCEIVER]: 1,
  [ChannelType.HEATING_CLIMATECONTROL_TRANSCEIVER]: 2,
  [ChannelType.SWITCH_VIRTUAL_RECEIVER]: 3,
  [ChannelType.BLIND_VIRTUAL_RECEIVER]: 4,
  [ChannelType.KEYMATIC]: 5,
  [ChannelType.ENERGIE_METER_TRANSMITTER]: 6,
};

// Channels that only hold configuration, not a state worth showing
export const isHiddenChannel = (channel: Channel) =>
  channel.type === 'MAINTENANCE' ||
  channel.type.endsWith('_WEEK_PROFILE') ||
  Object.keys(channel.datapoints).length === 0;

// Groups the visible channels by type, in the order they are shown
export const groupChannelsByType = (channels: Channel[]): [string, Channel[]][] => {
  const channelsPerType = new Map<string, Channel[]>();
  for (const channel of channels) {
    if (isHiddenChannel(channel)) {
      continue;
    }
    channelsPerType.set(channel.type, [...(channelsPerType.get(channel.type) ?? []), channel]);
  }
  return Array.from(channelsPerType).sort(
    ([typeA], [typeB]) =>
      (typeOrder[typeA] ?? 999) - (typeOrder[typeB] ?? 999) || typeA.localeCompare(typeB),
  );
};

// Applies a CCU event to the channels. Returns the same array if nothing
// changed, and new objects only for the channels concerned, so that
// React.memo can skip all others.
// With onlyIfCurrent, the value is only set if the datapoint still has that
// value: a rollback must not overwrite a value an event brought in since.
export const applyEvent = (
  channels: Channel[],
  event: HmEvent,
  onlyIfCurrent?: { value: Value },
): Channel[] => {
  // BidCos devices call it LOWBAT, HmIP devices LOW_BAT
  const statusType = event.datapoint === 'LOWBAT' ? 'LOW_BAT' : event.datapoint;
  const isStatusEvent = statusType === 'LOW_BAT' || statusType === 'UNREACH';

  let changed = false;
  const nextChannels = channels.map((channel) => {
    if (channel.address === event.channel) {
      const datapoints = channel.datapoints as Record<string, unknown>;
      if (onlyIfCurrent && datapoints[event.datapoint] !== onlyIfCurrent.value) {
        return channel;
      }
      changed = true;
      return {
        ...channel,
        datapoints: { ...channel.datapoints, [event.datapoint]: event.value },
      } as Channel;
    }
    // One device's status applies to all of its channels
    if (isStatusEvent && channel.statusAddress === event.channel) {
      changed = true;
      return {
        ...channel,
        status: { ...channel.status, [statusType]: event.value === true },
      };
    }
    return channel;
  });
  return changed ? nextChannels : channels;
};
