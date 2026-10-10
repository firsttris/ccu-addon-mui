import { type ComponentType, memo, Suspense } from 'react';
import type { Channel } from '../types/types';
import { sameItems } from '../hooks/channels';
import { controlOverrides, type SectionId } from '../controls/registry';
import { ControlComponent } from '../components/ControlComponent';
import { m } from '../paraglide/messages';
import { TileSkeleton } from '../components/ui/skeleton';
import type { GridTile } from './grid/GridDashboard';
import { deviceAddressOf } from '../lib/address';
import { groupBy } from '../lib/groupBy';

// --- Sections: one per kind of control

export const sectionTitles: Record<SectionId, () => string> = {
  climate: m.SECTION_CLIMATE,
  floor: m.SECTION_FLOOR,
  lights: m.SECTION_LIGHTS,
  blinds: m.SECTION_BLINDS,
  windows: m.SECTION_WINDOWS,
  doors: m.SECTION_DOORS,
  security: m.SECTION_SECURITY,
  signals: m.SECTION_SIGNALS,
  sensors: m.SECTION_SENSORS,
  water: m.SECTION_WATER,
  drives: m.SECTION_DRIVES,
  buttons: m.SECTION_BUTTONS,
  inputs: m.SECTION_INPUTS,
  energy: m.SECTION_ENERGY,
  system: m.SECTION_SYSTEM,
};

// The narrowest a tile of each section looks right (as the grids below)
const sectionMinPx: Record<SectionId | 'generic', number> = {
  climate: 232,
  floor: 300,
  lights: 150,
  blinds: 300,
  windows: 220,
  doors: 340,
  security: 250,
  signals: 250,
  sensors: 250,
  water: 250,
  drives: 280,
  buttons: 240,
  inputs: 250,
  energy: 260,
  system: 260,
  generic: 240,
};

// The tiles of a section in order, for arranging them in a grid
export const gridTiles = (group: SectionGroup): GridTile[] => {
  const minPx = sectionMinPx[group.section ?? 'generic'];
  return group.types.flatMap(([type, channels]) => {
    const override = controlOverrides[type];
    return override?.per === 'device'
      ? groupByDevice(channels).map(([deviceAddress, deviceChannels]) => ({
          key: `d:${deviceAddress}`,
          minPx: sectionMinPx[override.section ?? 'generic'] ?? minPx,
          channelIds: deviceChannels.map((c) => c.id),
          element: <DeviceTile component={override.component} channels={deviceChannels} />,
        }))
      : channels.map((channel) => ({
          key: `c:${channel.address}`,
          minPx: sectionMinPx[override?.section ?? 'generic'] ?? minPx,
          span: override?.wide ? 2 : 1,
          channelIds: [channel.id],
          element: <ControlComponent channel={channel} />,
        }));
  });
};

export const sectionGrids: Record<SectionId | 'generic', string> = {
  climate: '[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]',
  floor: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  lights: 'items-start [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]',
  blinds: '[grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
  windows: '[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
  doors: '[grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]',
  security: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  signals: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  sensors: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  water: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  drives: 'items-start [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]',
  buttons: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
  inputs: 'items-start [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]',
  energy: '[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]',
  system: '[grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]',
  generic: '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
};

// A control for all channels of a device: rendered again only when one of
// them changed (the list itself is new whenever its section is rebuilt)
const DeviceTile = memo(
  function DeviceTile({
    component: Component,
    channels,
  }: {
    component: ComponentType<{ channels: Channel[] }>;
    channels: Channel[];
  }) {
    return (
      <Suspense fallback={<TileSkeleton />}>
        <Component channels={channels} />
      </Suspense>
    );
  },
  (before, after) => before.component === after.component && sameItems(before.channels, after.channels),
);

// Groups channels by device (the address before ":"), in order of appearance
const groupByDevice = (channels: Channel[]) =>
  Array.from(groupBy(channels, (channel) => deviceAddressOf(channel.address)));

// A section: all types of one kind (e.g. KeyMatic and door lock drive under
// "Doors"), or a single type without its own control
export interface SectionGroup {
  key: string;
  section?: SectionId;
  types: [string, Channel[]][];
}

// Sections in the order of SectionId (sectionTitles), then the types
// without a control in the order they came
export const groupIntoSections = (channelsByType: [string, Channel[]][]): SectionGroup[] => {
  const groups = new Map<string, SectionGroup>();
  for (const [type, channels] of channelsByType) {
    const section = controlOverrides[type]?.section;
    const key = section ?? `type:${type}`;
    const group = groups.get(key) ?? { key, section, types: [] };
    group.types.push([type, channels]);
    groups.set(key, group);
  }
  const order = Object.keys(sectionTitles);
  return Array.from(groups.values()).sort(
    (a, b) =>
      (a.section ? order.indexOf(a.section) : order.length) - (b.section ? order.indexOf(b.section) : order.length),
  );
};
