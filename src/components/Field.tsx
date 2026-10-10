import type { ReactNode } from 'react';

// A form field with its label above it
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control comes as children
  <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
    {label}
    {children}
  </label>
);
