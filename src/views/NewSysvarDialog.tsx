import { useState } from 'react';
import { useChannelList, useObjectChange } from '../queries';
import { useToast } from '../contexts/ToastContext';
import type { Sysvar } from '../types/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input } from '../components/ui/input';
import { NativeSelect } from '../components/ui/select';
import { m } from '../paraglide/messages';
import { errorText } from '../lib/errors';
import { Field } from '../components/Field';

const kinds: { kind: Sysvar['kind']; label: () => string }[] = [
  { kind: 'bool', label: m.KIND_BOOL },
  { kind: 'alarm', label: m.KIND_ALARM },
  { kind: 'number', label: m.KIND_NUMBER },
  { kind: 'enum', label: m.KIND_ENUM },
  { kind: 'string', label: m.KIND_STRING },
];

const toNumber = (text: string) => (text.trim() === '' ? undefined : Number(text.replace(',', '.')));

// Creating a system variable with the settings its kind calls for, or
// changing them (the WebUI's sysvar dialog, system.fn::saveSysVar): its kind
// stays, renaming is in the list
export const NewSysvarDialog = ({ sysvar, onClose }: { sysvar?: Sysvar; onClose: () => void }) => {
  const { showToast } = useToast();
  const change = useObjectChange();
  const [name, setName] = useState(sysvar?.name ?? '');
  const [kind, setKind] = useState<Sysvar['kind']>(sysvar?.kind ?? 'bool');
  const [unit, setUnit] = useState(sysvar?.unit ?? '');
  const [min, setMin] = useState(sysvar?.min !== undefined ? String(sysvar.min) : '');
  const [max, setMax] = useState(sysvar?.max !== undefined ? String(sysvar.max) : '');
  const [trueName, setTrueName] = useState(sysvar?.trueName ?? '');
  const [falseName, setFalseName] = useState(sysvar?.falseName ?? '');
  const [values, setValues] = useState(sysvar?.valueList?.join('\n') ?? '');
  const [description, setDescription] = useState(sysvar?.description ?? '');
  const [channel, setChannel] = useState(sysvar?.channel ?? 0);
  const { data: channels = [] } = useChannelList({ enabled: !!sysvar });

  const valueList = values
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
  const invalidRange =
    kind === 'number' &&
    (Number.isNaN(toNumber(min) ?? 0) ||
      Number.isNaN(toNumber(max) ?? 0) ||
      (toNumber(min) ?? -65535) >= (toNumber(max) ?? 65535));
  const valid =
    name.trim() !== '' && !invalidRange && (kind !== 'enum' || valueList.length > 0) && !description.includes('^');

  const settings = {
    kind,
    ...(kind === 'number' ? { unit: unit.trim(), min: toNumber(min), max: toNumber(max) } : {}),
    ...(kind === 'bool' || kind === 'alarm' ? { trueName: trueName.trim(), falseName: falseName.trim() } : {}),
    ...(kind === 'enum' ? { valueList } : {}),
  };
  const create = () =>
    change.mutate(
      sysvar
        ? { type: 'editSysvar', id: sysvar.id, description: description.trim(), channel, ...settings }
        : { type: 'createSysvar', name: name.trim(), ...settings },
      {
        onSuccess: () => {
          showToast(sysvar ? m.SAVED() : m.CREATED(), 'info');
          onClose();
        },
        onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
      },
    );

  return (
    <ConfirmDialog
      title={sysvar ? m.EDIT_SYSVAR({ name: sysvar.name }) : m.NEW_SYSVAR()}
      confirmLabel={sysvar ? m.SAVE() : m.CREATE()}
      busy={!valid || change.isPending}
      onConfirm={create}
      onCancel={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) create();
        }}
      >
        {!sysvar && (
          <Field label={m.NAME()}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label={m.SYSVAR_KIND()}>
          <NativeSelect value={kind} disabled={!!sysvar} onChange={(e) => setKind(e.target.value as Sysvar['kind'])}>
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
        {sysvar && (
          <Field label={m.SYSVAR_CHANNEL()}>
            <NativeSelect value={String(channel)} onChange={(e) => setChannel(Number(e.target.value))}>
              <option value="0">{m.SYSVAR_NO_CHANNEL()}</option>
              {channel !== 0 && !channels.some((c) => c.id === channel) && (
                <option value={String(channel)}>{channel}</option>
              )}
              {[...channels]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        )}
        {sysvar && (
          <Field label={m.DESCRIPTION()}>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </Field>
        )}
      </form>
    </ConfirmDialog>
  );
};
