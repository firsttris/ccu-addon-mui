import { enumLabel } from '../settingKinds';

export const Segmented = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number | undefined;
  onChange: (value: number) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex w-fit flex-wrap rounded-lg bg-muted p-0.5">
    {options.map((option, index) => (
      // biome-ignore lint/a11y/useSemanticElements: a segmented switch: buttons with role radio and aria-checked; native radios would change its look
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={value === index}
        onClick={() => onChange(index)}
        className={
          value === index
            ? 'h-8 rounded-md bg-background px-3 text-sm font-medium shadow-xs'
            : 'h-8 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground'
        }
      >
        {enumLabel(option)}
      </button>
    ))}
  </div>
);
