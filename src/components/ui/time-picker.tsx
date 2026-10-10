import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import ClockIcon from '~icons/lucide/clock';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';

const pad = (n: number) => String(n).padStart(2, '0');

// One column of the picker; the chosen entry scrolled into the middle
const Column = ({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: number[];
  selected: number | undefined;
  onSelect: (value: number) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls to the new selection when it changes
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active && ref.current) {
      ref.current.scrollTop = active.offsetTop - ref.current.clientHeight / 2 + active.clientHeight / 2;
    }
  }, [selected]);
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      className="flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto p-1 [scrollbar-width:thin]"
    >
      {values.map((value) => (
        <button
          key={value}
          type="button"
          role="option"
          aria-selected={value === selected}
          onClick={() => onSelect(value)}
          className={cn(
            'h-8 shrink-0 rounded-md text-sm tabular-nums transition-colors',
            value === selected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          {pad(value)}
        </button>
      ))}
    </div>
  );
};

// A time of day with hours and the minutes allowed (e.g. quarter hours),
// opened by a click on the field. The browser's own time picker opens only
// on its icon and offers every minute.
export const TimePicker = ({
  label,
  minutes,
  step = 1,
  max = 24 * 60 - 1,
  disabled,
  onChange,
  className,
}: {
  label: string;
  // Minutes after midnight
  minutes: number | undefined;
  step?: number;
  max?: number;
  disabled?: boolean;
  onChange: (minutes: number) => void;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const hour = minutes === undefined ? undefined : Math.floor(minutes / 60);
  const minute = minutes === undefined ? undefined : minutes % 60;
  const hours = Array.from({ length: Math.floor(max / 60) + 1 }, (_, i) => i);
  const minuteValues = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter(
    (value) => (hour ?? 0) * 60 + value <= max,
  );
  const set = (h: number, min: number) => onChange(Math.min(h * 60 + min, max));
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'border-input dark:bg-input/30 flex h-9 w-32 items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm tabular-nums shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            className,
          )}
        >
          <span>{hour === undefined || minute === undefined ? '--:--' : `${pad(hour)}:${pad(minute)}`}</span>
          <ClockIcon className="size-4 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 flex divide-x rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <Column label={m.TIME_HOUR()} values={hours} selected={hour} onSelect={(h) => set(h, minute ?? 0)} />
          <Column
            label={m.TIME_MINUTE()}
            values={minuteValues}
            selected={minute}
            onSelect={(min) => {
              set(hour ?? 0, min);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
