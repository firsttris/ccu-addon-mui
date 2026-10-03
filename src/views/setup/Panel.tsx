import { HTMLAttributes } from 'react';

// A card in the setup area, with a small heading
export const Panel = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <section
    className={`my-4 mx-0 py-3 px-4 border border-solid border-border rounded-lg bg-surface [&_h2]:mt-0 [&_h2]:mx-0 [&_h2]:mb-2 [&_h2]:text-[16px] ${className}`}
    {...props}
  />
);
