import { useState } from 'react';
import ChevronDownIcon from '~icons/lucide/chevrons-up-down';
import { useDevices, useRooms } from '../queries';
import type { Channel } from '../types/types';
import { cn } from '../lib/utils';
import { m } from '../paraglide/messages';
import { ChannelPicker } from './ChannelPicker';
import { DeviceImage } from './DeviceImage';
import { channelOf, deviceAddressOf } from '../lib/address';

interface ChannelFieldProps {
  label: string;
  // The chosen channel's id, 0 or undefined for none
  value: number | undefined;
  channels: Channel[];
  onChange: (id: number) => void;
  disabled?: boolean;
  includeHidden?: boolean;
  className?: string;
}

// A channel to choose in place of a long dropdown: shows the chosen one with
// its device picture and room, and opens the channel dialog on a click
export const ChannelField = ({
  label,
  value,
  channels,
  onChange,
  disabled,
  includeHidden,
  className,
}: ChannelFieldProps) => {
  const [open, setOpen] = useState(false);
  const { data: devices = [] } = useDevices();
  const { data: rooms = [] } = useRooms();
  const channel = value ? channels.find((c) => c.id === value) : undefined;
  const device = channel ? devices.find((d) => d.address === deviceAddressOf(channel.address)) : undefined;
  const room = channel?.rooms
    ?.map((id) => rooms.find((r) => r.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'border-input dark:bg-input/30 flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-2 py-1 text-left text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          className,
        )}
      >
        {channel ? (
          <>
            <DeviceImage
              type={device?.type}
              size={28}
              channel={channelOf(channel.address)}
              className="shrink-0 rounded"
            />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate">{channel.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[room, channel.address].filter(Boolean).join(' · ')}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 px-1 text-muted-foreground">{value ? `#${value}` : m.PICKER_CHOOSE_CHANNEL()}</span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <ChannelPicker
          title={label}
          channels={channels}
          chosen={new Set(value ? [value] : [])}
          single
          includeHidden={includeHidden}
          onConfirm={([id]) => {
            setOpen(false);
            if (id !== undefined) onChange(id);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
