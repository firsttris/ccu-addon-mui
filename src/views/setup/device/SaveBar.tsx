import CheckIcon from '~icons/lucide/check-circle-2';
import SendIcon from '~icons/lucide/send';
import { ConfirmDialog, DialogButton } from '../../../components/ConfirmDialog';
import { readableValue } from '../../../controls/generic/settingValues';
import { parameterLabel } from '../../../controls/generic/parameters';
import { m } from '../../../paraglide/messages';
import type { Change, Transfer } from './deviceSettingsModel';

// What the bar says about the last save
const transferTexts: Record<Exclude<Transfer, 'none'>, { icon: 'send' | 'check'; tint: string; text: () => string }> = {
  sending: { icon: 'send', tint: 'animate-pulse text-sky-600', text: m.SETTINGS_SENDING },
  pending: { icon: 'send', tint: 'animate-pulse text-amber-600', text: m.CONFIG_PENDING },
  done: { icon: 'check', tint: 'text-green-600', text: m.SETTINGS_TRANSFERRED },
  handedOver: { icon: 'check', tint: 'text-green-600', text: m.SETTINGS_HANDED_OVER },
};

const SaveStatus = ({ changes, transfer }: { changes: number; transfer: Transfer }) => {
  if (changes > 0) {
    return (
      <>
        <span className="size-2 rounded-full bg-blue-600" />
        {m.SETTINGS_UNSAVED({ count: changes })}
      </>
    );
  }
  if (transfer === 'none') return <span className="text-muted-foreground">{m.SETTINGS_NO_CHANGES()}</span>;
  const { icon, tint, text } = transferTexts[transfer];
  const Icon = icon === 'send' ? SendIcon : CheckIcon;
  return (
    <>
      <Icon className={`size-4 ${tint}`} />
      {text()}
    </>
  );
};

// The unsaved changes and how the last save is going, with reset and save
export const SaveBar = ({
  changes,
  transfer,
  onReset,
  onSave,
}: {
  changes: number;
  transfer: Transfer;
  onReset: () => void;
  onSave: () => void;
}) => (
  <section
    aria-label={m.SETTINGS_SAVE_BAR()}
    className={`sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border p-3 shadow-lg backdrop-blur-md transition-colors ${changes > 0 ? 'border-blue-500/40 bg-blue-50/90 dark:bg-blue-950/60' : 'bg-background/85'}`}
  >
    <span role="status" className="mr-auto flex items-center gap-2 text-sm">
      <SaveStatus changes={changes} transfer={transfer} />
    </span>
    {changes > 0 && (
      <DialogButton type="button" onClick={onReset}>
        {m.RESET()}
      </DialogButton>
    )}
    <DialogButton type="button" primary disabled={changes === 0} onClick={onSave}>
      <SendIcon />
      {m.SETTINGS_SAVE_TRANSFER()} {changes > 0 ? `(${changes})` : ''}
    </DialogButton>
  </section>
);

// The changes with their old and new values, before they are saved
export const ConfirmChangesDialog = ({
  changes,
  names,
  busy,
  onConfirm,
  onCancel,
}: {
  changes: Change[];
  names: Map<string, string>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <ConfirmDialog title={m.SAVE_CHANGES()} confirmLabel={m.SAVE()} busy={busy} onConfirm={onConfirm} onCancel={onCancel}>
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {changes.map((c) => (
        <li key={`${c.address}.${c.name}`}>
          <strong>{parameterLabel(c.name)}</strong> ({names.get(c.address) ?? c.address}):{' '}
          {readableValue(c.name, c.parameter, c.previous)} → {readableValue(c.name, c.parameter, c.value)}
        </li>
      ))}
    </ul>
    <p className="mt-3 text-muted-foreground">{m.SETTINGS_TRANSFER_HINT()}</p>
  </ConfirmDialog>
);
