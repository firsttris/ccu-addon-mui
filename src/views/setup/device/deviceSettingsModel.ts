import type { Channel, DeviceDescription } from '../../../types/protocol';
import type { DatapointValue, Device, ParamsetDescription } from '../../../types/types';
import type { WeekProgramKind } from '../../../controls/schedule/WeekProgramSheet';
import { isHiddenChannel } from '../../../hooks/channels';
import { channelNumberOf } from '../../../lib/address';

// What the device page shows, worked out from the device, its channels
// and their MASTER paramsets: pure functions, the hooks and components
// beside it use them.

export type Values = Record<string, DatapointValue>;

// The settings of one address: collected and transferred together
export interface SettingsSection {
  address: string;
  description: ParamsetDescription;
  current: Values;
}

// Unsaved changes per address
export type Drafts = Record<string, Values>;

export interface Change {
  address: string;
  name: string;
  parameter: ParamsetDescription[string];
  previous: DatapointValue | undefined;
  value: DatapointValue;
}

// The drafts with one value changed; back to the saved value it is no
// change any more
export const withDraft = (drafts: Drafts, address: string, current: Values, name: string, value: DatapointValue) => {
  const next = { ...(drafts[address] ?? {}), [name]: value };
  if (current[name] === value) delete next[name];
  return { ...drafts, [address]: next };
};

export const changesOf = (sections: SettingsSection[], drafts: Drafts): Change[] =>
  sections.flatMap((s) =>
    Object.entries(drafts[s.address] ?? {}).map(([name, value]) => ({
      address: s.address,
      name,
      parameter: s.description[name],
      previous: s.current[name],
      value,
    })),
  );

// After saving, the CCU transfers the settings to the device: sending for
// a moment, pending while CONFIG_PENDING is set (battery devices fetch
// them when woken up), handed over without CONFIG_PENDING to watch
export type Transfer = 'none' | 'sending' | 'pending' | 'done' | 'handedOver';

export const SENDING_MS = 4000;
export const WATCH_MS = 120_000;

export const transferOf = ({
  since,
  now,
  configPending,
}: {
  since: number | null;
  now: number;
  // undefined: the device has no CONFIG_PENDING to watch
  configPending: boolean | undefined;
}): Transfer =>
  since === null
    ? 'none'
    : configPending
      ? 'pending'
      : configPending === undefined
        ? 'handedOver'
        : // The CCU needs a moment to mark the device pending; until then
          // nothing is claimed
          now - since < SENDING_MS
          ? 'sending'
          : 'done';

// HmIP actuators keep their own week program on a *_WEEK_PROFILE channel
export const weekProgramKindOf = (type: string): WeekProgramKind | null =>
  !type.endsWith('_WEEK_PROFILE')
    ? null
    : type.startsWith('BLIND') || type.startsWith('SHUTTER')
      ? 'blind'
      : type.startsWith('SWITCH') || type.startsWith('WATER_SWITCH')
        ? 'switch'
        : 'dimmer';

// Bits of WP_TARGET_CHANNELS: the device's virtual channels in order
// (getWPVirtualChannels in the WebUI's HmIPWeeklyProgram.js)
export const weekProgramTargetsOf = (device: Device | undefined, names: Map<string, string>) =>
  (device?.channels ?? [])
    .filter((c) => /_VIRTUAL_RECEIVER|ACCESS_RECEIVER|ACCESS_TRANSCEIVER|DOOR_LOCK_STATE_TRANSMITTER/.test(c.type))
    .map((c, index) => ({ index, label: names.get(c.address) ?? c.address }));

export interface ChannelCard {
  channel: Pick<DeviceDescription, 'address' | 'type' | 'index'>;
  // The channel in ReGa (name, rooms), if it has one there
  rega?: Channel;
  section?: SettingsSection;
  label: string;
  // Under "more channels"
  folded: boolean;
}

// One card per channel; channel 0 (maintenance) belongs to the device card
export const channelCardsOf = ({
  address,
  device,
  channels,
  sections,
  names,
}: {
  address: string;
  device: Device | undefined;
  // All channels in ReGa
  channels: Channel[];
  sections: SettingsSection[];
  names: Map<string, string>;
}): ChannelCard[] => {
  const regaOf = new Map(channels.filter((c) => c.address.startsWith(`${address}:`)).map((c) => [c.address, c]));
  const sectionOf = new Map(sections.map((s) => [s.address, s]));
  return [
    ...new Map(
      [
        ...[...regaOf.values()].map((c) => ({ address: c.address, type: c.type, index: channelNumberOf(c.address) })),
        // The interface's description wins: it knows every channel
        ...(device?.channels ?? []),
      ].map((c) => [c.address, c]),
    ).values(),
  ]
    .filter((c) => c.index > 0)
    .sort((a, b) => a.index - b.index)
    .map((channel, i, all) => {
      const rega = regaOf.get(channel.address);
      const section = sectionOf.get(channel.address);
      // The 2nd and 3rd virtual channel of an HmIP actuator are rarely
      // needed, as are channels without state and settings
      const secondary = channel.type.endsWith('_VIRTUAL_RECEIVER') && all[i - 1]?.type === channel.type;
      return {
        channel,
        rega,
        section,
        label: names.get(channel.address) ?? rega?.name ?? channel.address,
        folded: secondary || (!section && (!rega || isHiddenChannel(rega))),
      };
    });
};

// Device-wide settings are on the device (BidCos) or its channel 0 (HmIP)
export const deviceSectionsOf = (address: string, sections: SettingsSection[]) =>
  sections.filter((s) => s.address === address || s.address === `${address}:0`);
