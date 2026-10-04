import { Channel, HmEvent } from '../types/types';
import { controlOverrides } from '../controls/registry';

export type Value = string | number | boolean;

// Channels that only hold configuration, not a state worth showing
export const isHiddenChannel = (channel: Channel) =>
  channel.type === 'MAINTENANCE' ||
  channel.type.endsWith('_WEEK_PROFILE') ||
  // The CCU's 50 virtual keys, as long as nobody gave them a name
  (channel.type === 'VIRTUAL_KEY' && /^HM-RCV-50 /.test(channel.name)) ||
  Object.keys(channel.datapoints).length === 0;

// HmIP actuators report their actual state on a *_TRANSMITTER channel and
// are switched through *_VIRTUAL_RECEIVER channels. Where both are shown,
// the transmitter only repeats the state.
const MIRRORS: Record<string, string> = {
  SWITCH_TRANSMITTER: 'SWITCH_VIRTUAL_RECEIVER',
  BLIND_TRANSMITTER: 'BLIND_VIRTUAL_RECEIVER',
  SHUTTER_TRANSMITTER: 'SHUTTER_VIRTUAL_RECEIVER',
  DIMMER_TRANSMITTER: 'DIMMER_VIRTUAL_RECEIVER',
  UNIVERSAL_LIGHT_TRANSMITTER: 'UNIVERSAL_LIGHT_RECEIVER',
  WATER_SWITCH_TRANSMITTER: 'WATER_SWITCH_VIRTUAL_RECEIVER',
};

const deviceOf = (channel: Channel) => channel.address.split(':')[0];

const isMirror = (channel: Channel, shown: Set<string>) => {
  const receiverType = MIRRORS[channel.type];
  return receiverType !== undefined && shown.has(`${deviceOf(channel)}|${receiverType}`);
};

// Groups the visible channels by type, in the order they are shown
export const groupChannelsByType = (channels: Channel[]): [string, Channel[]][] => {
  const shown = new Set(channels.map((c) => `${deviceOf(c)}|${c.type}`));
  // Types with a hand-made control come first, in the order of the
  // registry; all others follow alphabetically and are shown by
  // GenericControl. Read here, not at load time: the registry's controls
  // import this module.
  const typeOrder = new Map(Object.keys(controlOverrides).map((type, index) => [type, index]));
  const channelsPerType = new Map<string, Channel[]>();
  for (const channel of channels) {
    if (isHiddenChannel(channel) || isMirror(channel, shown)) {
      continue;
    }
    channelsPerType.set(channel.type, [...(channelsPerType.get(channel.type) ?? []), channel]);
  }
  return Array.from(channelsPerType).sort(
    ([typeA], [typeB]) =>
      (typeOrder.get(typeA) ?? 999) - (typeOrder.get(typeB) ?? 999) || typeA.localeCompare(typeB),
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
