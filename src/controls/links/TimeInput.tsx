import { useEffect, useState } from 'react';
import { NativeSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { formatNumber } from '../../lib/utils';
import { m } from '../../paraglide/messages';
import { PERMANENT, TIME_PRESETS } from './linkProfiles';

// A time of a link profile as the WebUI's time selector offers it: common
// durations, "not active" (0), "permanent" and a value of one's own.

const UNITS = [
  { seconds: 1, label: 's' },
  { seconds: 60, label: 'min' },
  { seconds: 3600, label: 'h' },
];

export const formatSeconds = (seconds: number) => {
  if (seconds === PERMANENT) return m.TIME_PERMANENT();
  if (seconds === 0) return m.TIME_NOT_ACTIVE();
  const unit = [...UNITS].reverse().find((u) => seconds >= u.seconds && seconds % u.seconds === 0) ?? UNITS[0];
  return `${formatNumber(seconds / unit.seconds, 1)} ${unit.label}`;
};

const key = (seconds: number) => (seconds === PERMANENT ? 'permanent' : String(seconds));

interface TimeInputProps {
  label: string;
  seconds: number;
  // Longest time the device takes (without "permanent")
  max: number;
  onChange: (seconds: number) => void;
}

export const TimeInput = ({ label, seconds, max, onChange }: TimeInputProps) => {
  const presets = TIME_PRESETS.filter((s) => s === PERMANENT || s <= max);
  const isPreset = presets.includes(seconds);
  const [custom, setCustom] = useState(!isPreset);
  const fitting = [...UNITS].reverse().find((u) => seconds >= u.seconds && seconds % u.seconds === 0) ?? UNITS[0];
  const [unit, setUnit] = useState(fitting.seconds);
  const [draft, setDraft] = useState(seconds === PERMANENT ? '' : String(seconds / fitting.seconds));
  useEffect(() => {
    if (!isPreset) setCustom(true);
  }, [isPreset]);

  const commit = (text: string, unitSeconds: number) => {
    const value = Number(text.replace(',', '.'));
    if (text === '' || Number.isNaN(value) || value < 0) return;
    onChange(Math.min(max, Math.round(value * unitSeconds * 10) / 10));
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <NativeSelect
        className="h-8 w-40 md:text-[13px]"
        aria-label={label}
        value={custom ? 'custom' : key(seconds)}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(value === 'permanent' ? PERMANENT : Number(value));
        }}
      >
        {presets.map((s) => (
          <option key={key(s)} value={key(s)}>
            {formatSeconds(s)}
          </option>
        ))}
        <option value="custom">{m.TIME_CUSTOM()}</option>
      </NativeSelect>
      {custom && (
        <>
          <Input
            className="h-8 w-20 text-right tabular-nums md:text-[13px]"
            aria-label={`${label} (${m.TIME_CUSTOM()})`}
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft, unit)}
            onKeyDown={(event) => event.key === 'Enter' && commit(draft, unit)}
          />
          <NativeSelect
            className="h-8 w-20 md:text-[13px]"
            aria-label={`${label} (${m.TIME_UNIT()})`}
            value={unit}
            onChange={(event) => {
              setUnit(Number(event.target.value));
              commit(draft, Number(event.target.value));
            }}
          >
            {UNITS.map((u) => (
              <option key={u.seconds} value={u.seconds}>
                {u.label}
              </option>
            ))}
          </NativeSelect>
        </>
      )}
    </span>
  );
};
