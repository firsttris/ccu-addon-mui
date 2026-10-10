import { useMemo, useState } from 'react';
import SearchIcon from '~icons/lucide/search';
import { useDevices, useRooms } from '../queries';
import type { Channel } from '../types/types';
import { channelTypeName } from '../i18n/channelTypeNames';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { DeviceImage } from './DeviceImage';
import { isHiddenChannel } from '../hooks/channels';
import { humanize } from '../controls/generic/parameters';
import { matchScore } from './channelSearch';

interface ChannelPickerProps {
  title: string;
  channels: Channel[];
  // Already chosen: shown checked, not to be chosen again
  chosen: Set<number>;
  // "Only without room" and the like; unset hides the filter
  unassigned?: { label: string; test: (channel: Channel) => boolean };
  confirmLabel?: string;
  onConfirm: (ids: number[]) => void;
  onClose: () => void;
  // One channel: a click chooses it and closes the dialog
  single?: boolean;
  // Also channels without state (keys and the like), e.g. for programs
  includeHidden?: boolean;
}

interface DeviceGroup {
  address: string;
  name: string;
  type: string;
  channels: Channel[];
}

const deviceOf = (channel: Channel) => channel.address.split(':')[0];

// The channel type in words; types without a translation made readable
const typeLabel = (type: string) => {
  const label = channelTypeName(type);
  return label === type ? humanize(type) : label;
};

// Choosing channels in a dialog: the devices with their pictures (the
// channel pointed at marked), sorted by device type, a search over name,
// device, type, room and address, and check boxes to take several at once,
// or (single) one with a click
export const ChannelPicker = ({
  title,
  channels,
  chosen,
  unassigned,
  confirmLabel,
  onConfirm,
  onClose,
  single = false,
  includeHidden = false,
}: ChannelPickerProps) => {
  const { data: devices = [] } = useDevices();
  const { data: rooms = [] } = useRooms();
  const [query, setQuery] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const groups = useMemo(() => {
    const deviceInfo = new Map(devices.map((d) => [d.address, d]));
    const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
    const byDevice = new Map<string, DeviceGroup & { score: number }>();
    for (const channel of channels) {
      if (!includeHidden && isHiddenChannel(channel)) continue;
      if (onlyUnassigned && unassigned && !unassigned.test(channel) && !chosen.has(channel.id)) continue;
      const address = deviceOf(channel);
      const device = deviceInfo.get(address);
      const score = matchScore(query, [
        channel.name,
        device?.name ?? '',
        device?.type ?? '',
        channel.address,
        typeLabel(channel.type),
        ...(channel.rooms ?? []).map((id) => roomNames.get(id) ?? ''),
      ]);
      if (score === 0) continue;
      const group = byDevice.get(address) ?? {
        address,
        name: device?.name || address,
        type: device?.type ?? '',
        channels: [],
        score: 0,
      };
      group.channels.push(channel);
      group.score = Math.max(group.score, score);
      byDevice.set(address, group);
    }
    const list = Array.from(byDevice.values());
    for (const g of list) g.channels.sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }));
    // By device type, then name; while searching the best matches first
    return list.sort(
      (a, b) =>
        (query.trim() ? b.score - a.score : 0) ||
        Number(!a.type) - Number(!b.type) ||
        a.type.localeCompare(b.type) ||
        a.name.localeCompare(b.name),
    );
  }, [channels, devices, rooms, query, onlyUnassigned, unassigned, chosen, includeHidden]);
  // The channel pointed at, marked in its device's picture
  const [pointed, setPointed] = useState<string | undefined>();

  const toggle = (ids: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // Group headings by device type, as long as nobody searches
  let lastType = '';
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100vh-32px)] flex-col gap-3 sm:max-w-2xl" aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{m.PICKER_HINT()}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            className="pl-9"
            placeholder={m.PICKER_SEARCH()}
            aria-label={m.PICKER_SEARCH()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {unassigned && (
          <div className="flex items-center gap-2">
            <Switch id="picker-unassigned" checked={onlyUnassigned} onCheckedChange={setOnlyUnassigned} />
            <Label htmlFor="picker-unassigned" className="text-sm font-normal">
              {unassigned.label}
            </Label>
          </div>
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: Safari drops the list role of a ul without bullets; the role says it explicitly */}
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto border-y px-6" role="list" aria-label={m.PICKER_DEVICES()}>
          {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{m.PICKER_NONE()}</p>}
          {groups.map((group) => {
            const heading = !query.trim() && group.type !== lastType;
            lastType = group.type;
            const open = group.channels.filter((c) => !chosen.has(c.id)).map((c) => c.id);
            const allOn = open.length > 0 && open.every((id) => selected.has(id));
            return (
              // biome-ignore lint/a11y/useSemanticElements: see the list role above
              <div key={group.address} role="listitem" aria-label={group.name}>
                {heading && (
                  <div className="sticky top-0 z-10 -mx-6 bg-background/95 px-6 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
                    {group.type || m.PICKER_OTHER()}
                  </div>
                )}
                <div className="flex gap-3 border-b py-3 last:border-b-0">
                  <DeviceImage
                    type={group.type}
                    size={56}
                    channel={pointed?.startsWith(`${group.address}:`) ? pointed.split(':')[1] : undefined}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
                      {!single && group.channels.length > 1 && open.length > 0 && (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {m.PICKER_ALL()}
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            aria-label={m.PICKER_ALL_OF({ name: group.name })}
                            checked={allOn}
                            onChange={(e) => toggle(open, e.target.checked)}
                          />
                        </span>
                      )}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {group.type && `${group.type} · `}
                      <span className="font-mono">{group.address}</span>
                    </span>
                    <ul className="mt-1 flex flex-col">
                      {group.channels.map((channel) => {
                        const already = chosen.has(channel.id);
                        const point = {
                          onPointerEnter: () => setPointed(channel.address),
                          onPointerLeave: () => setPointed(undefined),
                        };
                        if (single) {
                          return (
                            <li key={channel.id}>
                              <button
                                type="button"
                                aria-pressed={already}
                                onClick={() => onConfirm([channel.id])}
                                onFocus={() => setPointed(channel.address)}
                                {...point}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                                  already && 'bg-primary/10 font-medium',
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    'grid size-4 shrink-0 place-items-center rounded-full border',
                                    already && 'border-primary',
                                  )}
                                >
                                  {already && <span className="size-2 rounded-full bg-primary" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {typeLabel(channel.type)}
                                </span>
                                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                                  :{channel.address.split(':')[1]}
                                </span>
                              </button>
                            </li>
                          );
                        }
                        return (
                          <li key={channel.id} {...point}>
                            <label
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                                already && 'cursor-default opacity-60 hover:bg-transparent',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-primary"
                                checked={already || selected.has(channel.id)}
                                disabled={already}
                                onChange={(e) => toggle([channel.id], e.target.checked)}
                              />
                              <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{typeLabel(channel.type)}</span>
                              <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                                :{channel.address.split(':')[1]}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {single ? m.PICKER_CHOOSE_ONE() : m.PICKER_SELECTED({ count: selected.size })}
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {m.CANCEL()}
            </Button>
            {!single && (
              <Button type="button" disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
                {confirmLabel}
              </Button>
            )}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
