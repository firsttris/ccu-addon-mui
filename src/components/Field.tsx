import type { ReactNode } from 'react';

// A form field with its label above it. Dense: smaller, for the rows of
// the program editor and the notification rules, where fields stand side
// by side and may shrink.
export const Field = ({ label, dense = false, children }: { label: string; dense?: boolean; children: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control comes as children
  <label
    className={dense ? 'flex min-w-0 flex-col gap-1 text-xs' : 'flex flex-col gap-1.5 text-sm text-muted-foreground'}
  >
    <span className="text-muted-foreground">{label}</span>
    {children}
  </label>
);
