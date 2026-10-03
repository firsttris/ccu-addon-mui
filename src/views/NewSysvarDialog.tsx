import { useState } from 'react';
import { useObjectChange } from '../queries';
import { useToast } from '../contexts/ToastContext';
import { Sysvar } from '../types/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';
import { NativeSelect } from '../components/ui/select';
import { m } from '../paraglide/messages';

const kinds: { kind: Sysvar['kind']; label: () => string }[] = [
  { kind: 'bool', label: m.KIND_BOOL },
  { kind: 'alarm', label: m.KIND_ALARM },
  { kind: 'number', label: m.KIND_NUMBER },
  { kind: 'enum', label: m.KIND_ENUM },
  { kind: 'string', label: m.KIND_STRING },
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
    {label}
    {children}
  </label>
);

const toNumber = (text: string) => (text.trim() === '' ? undefined : Number(text.replace(',', '.')));

// Creating a system variable with the settings its kind calls for
export const NewSysvarDialog = ({ onClose }: { onClose: () => void }) => {
  const { showToast } = useToast();
  const change = useObjectChange();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Sysvar['kind']>('bool');
  const [unit, setUnit] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [trueName, setTrueName] = useState('');
  const [falseName, setFalseName] = useState('');
  const [values, setValues] = useState('');

  const valueList = values
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
  const invalidRange =
    kind === 'number' &&
    (Number.isNaN(toNumber(min) ?? 0) ||
      Number.isNaN(toNumber(max) ?? 0) ||
      (toNumber(min) ?? -65535) >= (toNumber(max) ?? 65535));
  const valid = name.trim() !== '' && !invalidRange && (kind !== 'enum' || valueList.length > 0);

  const create = () =>
    change.mutate(
      {
        type: 'createSysvar',
        name: name.trim(),
        kind,
        ...(kind === 'number' ? { unit: unit.trim(), min: toNumber(min), max: toNumber(max) } : {}),
        ...(kind === 'bool' || kind === 'alarm' ? { trueName: trueName.trim(), falseName: falseName.trim() } : {}),
        ...(kind === 'enum' ? { valueList } : {}),
      },
      {
        onSuccess: () => {
          showToast(m.CREATED(), 'info');
          onClose();
        },
        onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
      },
    );

  return (
    <ConfirmDialog title={m.NEW_SYSVAR()} confirmLabel={m.CREATE()} busy={!valid || change.isPending} onConfirm={create} onCancel={onClose}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) create();
        }}
      >
        <Field label={m.NAME()}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={m.SYSVAR_KIND()}>
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as Sysvar['kind'])}>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label()}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {kind === 'number' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label={m.MINIMUM()}>
              <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="-65535" />
            </Field>
            <Field label={m.MAXIMUM()}>
              <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="65535" />
            </Field>
            <Field label={m.UNIT()}>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C" />
            </Field>
          </div>
        )}
        {(kind === 'bool' || kind === 'alarm') && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={m.TRUE_NAME()}>
              <Input value={trueName} onChange={(e) => setTrueName(e.target.value)} />
            </Field>
            <Field label={m.FALSE_NAME()}>
              <Input value={falseName} onChange={(e) => setFalseName(e.target.value)} />
            </Field>
          </div>
        )}
        {kind === 'enum' && (
          <Field label={`${m.VALUE_LIST()} (${m.VALUE_LIST_HINT()})`}>
            <textarea
              rows={4}
              value={values}
              onChange={(e) => setValues(e.target.value)}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </Field>
        )}
      </form>
    </ConfirmDialog>
  );
};
