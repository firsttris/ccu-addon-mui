import { useEffect, useState } from 'react';
import type { ParameterDescription } from '../../../types/types';
import { clamp } from '../settingValues';

// 0..100 % with a slider and the exact value next to it
export const PercentSlider = ({
  label,
  parameter,
  value,
  onChange,
}: {
  label: string;
  parameter: ParameterDescription;
  value: number | undefined;
  onChange: (value: number) => void;
}) => {
  const scale = parameter.type === 'FLOAT' || parameter.unit === '100%' ? 100 : 1;
  const shown = value === undefined ? 0 : Math.round(value * scale);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const max = typeof parameter.max === 'number' ? Math.round(parameter.max * scale) : 100;
  const min = typeof parameter.min === 'number' ? Math.round(parameter.min * scale) : 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="h-2 w-40 cursor-pointer accent-primary"
        aria-label={label}
        aria-valuetext={`${draft} %`}
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
        onKeyUp={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
        onBlur={() => draft !== shown && onChange(clamp(parameter, draft / scale))}
      />
      <span className="w-12 text-right text-sm tabular-nums">{draft} %</span>
    </div>
  );
};
