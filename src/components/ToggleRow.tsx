import { Switch } from './ui/switch';

// A switch with its label and a hint below it, for settings pages
export const ToggleRow = ({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <label htmlFor={id} className="flex flex-col gap-0.5 text-sm">
      {label}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
    <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>
);
