import { ReactNode } from 'react';

// A form field with its label above it
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
    {label}
    {children}
  </label>
);
