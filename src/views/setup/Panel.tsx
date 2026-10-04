import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { WebUILink } from '../../components/WebUILink';
import { m } from '../../paraglide/messages';

// A card in the setup area, with a small heading
export const Panel = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <section
    className={cn(
      'flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs [&_h2]:text-base [&_h2]:font-semibold [&_p]:text-sm [&_p]:text-muted-foreground',
      className,
    )}
    {...props}
  />
);

// A setting the server reads from the CCU's own files (network, firewall,
// …): not there when the add-on runs elsewhere, e.g. on a PC during
// development. Said instead of leaving the card out.
export const OnlyOnCCU = ({ title }: { title: string }) => (
  <Panel aria-label={title}>
    <h2>{title}</h2>
    <p>
      {m.ONLY_ON_CCU()} <WebUILink />
    </p>
  </Panel>
);
