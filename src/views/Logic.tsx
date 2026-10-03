import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import { useLogicAction, useObjectChange, usePrograms, useSysvars } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { Sysvar } from '../types/types';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { EditableName } from '../components/EditableName';
import { Button } from '../components/ui/button';
import { NewSysvarDialog } from './NewSysvarDialog';
import PlusIcon from '~icons/lucide/plus';
import { m } from '../paraglide/messages';
import { Input as UiInput } from '../components/ui/input';
import { NativeSelect } from '../components/ui/select';
import { usePageTitle } from '../contexts/PageTitleContext';
import { cn } from '../lib/utils';

type Children = { children: ReactNode };

const Container = ({ children }: Children) => (
  <div className="flex max-w-3xl flex-col gap-4">{children}</div>
);

export const List = ({ children, ...props }: HTMLAttributes<HTMLUListElement>) => (
  <ul className="tile-edge flex flex-col divide-y overflow-hidden rounded-2xl border bg-card" {...props}>
    {children}
    <li className="hidden px-4 py-8 text-center text-sm text-muted-foreground only:block">{m.EMPTY_LIST()}</li>
  </ul>
);

export const Item = ({ children }: Children) => (
  <li className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">{children}</li>
);

export const Name = ({ children }: Children) => (
  <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium wrap-anywhere">{children}</span>
);

export const Controls = ({ children }: Children) => <span className="flex shrink-0 items-center gap-2">{children}</span>;

const Toggle = ({ on, alarm, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; alarm?: boolean }) => (
  <button
    className={cn(
      'press h-10 min-w-16 rounded-full px-4 text-sm font-medium',
      on
        ? alarm
          ? 'bg-red-600 text-white shadow-[0_0_18px_-4px_rgba(220,38,38,0.6)]'
          : 'bg-green-600 text-white shadow-[0_0_18px_-4px_rgba(22,163,74,0.6)]'
        : 'bg-muted text-muted-foreground',
    )}
    {...props}
  />
);

const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <UiInput className="w-28 text-right" {...props} />;

const Badge = ({ children }: Children) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{children}</span>
);

// A text or number input that sets its value on Enter or when left
const DraftInput = ({
  label,
  value,
  numeric,
  onCommit,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  onCommit: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <Input
      aria-label={label}
      inputMode={numeric ? 'decimal' : undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && commit()}
    />
  );
};

export const SysvarControl = ({ sysvar, onSet }: { sysvar: Sysvar; onSet: (value: string | number | boolean) => void }) => {
  switch (sysvar.kind) {
    case 'bool':
    case 'alarm': {
      const on = sysvar.value === true;
      return (
        <Toggle
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={sysvar.name}
          on={on}
          alarm={sysvar.kind === 'alarm'}
          onClick={() => onSet(!on)}
        >
          {(on ? sysvar.trueName : sysvar.falseName) || (on ? '1' : '0')}
        </Toggle>
      );
    }
    case 'enum':
      return (
        <NativeSelect
          className="w-44"
          aria-label={sysvar.name}
          value={typeof sysvar.value === 'number' ? sysvar.value : ''}
          onChange={(event) => onSet(Number(event.target.value))}
        >
          {(sysvar.valueList ?? []).map((option, index) => (
            <option key={`${index}-${option}`} value={index}>
              {option}
            </option>
          ))}
        </NativeSelect>
      );
    case 'number':
      return (
        <>
          <DraftInput
            label={sysvar.name}
            numeric
            value={typeof sysvar.value === 'number' ? String(sysvar.value) : ''}
            onCommit={(draft) => {
              let value = Number(draft.replace(',', '.'));
              if (Number.isNaN(value)) return;
              if (sysvar.min !== undefined) value = Math.max(sysvar.min, value);
              if (sysvar.max !== undefined) value = Math.min(sysvar.max, value);
              onSet(value);
            }}
          />
          {sysvar.unit && <span className="text-muted-foreground">{sysvar.unit}</span>}
        </>
      );
    default:
      return <DraftInput label={sysvar.name} value={String(sysvar.value ?? '')} onCommit={(draft) => onSet(draft)} />;
  }
};

export const Sysvars = () => {
  const { showToast } = useToast();
  const { userLevel, elevated } = useWebSocketContext();
  const canConfigure = userLevel === 'admin' && elevated;
  const { data: sysvars = [] } = useSysvars();
  const action = useLogicAction();
  const change = useObjectChange();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Sysvar | null>(null);
  usePageTitle(m.SYSVARS());

  const runChange = (variables: Parameters<typeof change.mutate>[0], success: string, onSuccess?: () => void) =>
    change.mutate(variables, {
      onSuccess: () => {
        showToast(success, 'info');
        onSuccess?.();
      },
      onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    });

  return (
    <Container>
      {canConfigure && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setCreating(true)}>
            <PlusIcon />
            {m.NEW_SYSVAR()}
          </Button>
        </div>
      )}
      <List aria-label={m.SYSVARS()}>
        {sysvars
          .filter((sv) => sv.visible)
          .map((sysvar) => (
            <Item key={sysvar.id}>
              {canConfigure ? (
                <EditableName
                  name={sysvar.name}
                  onRename={(name) => runChange({ type: 'renameSysvar', id: sysvar.id, name }, m.RENAMED())}
                  onDelete={() => setDeleting(sysvar)}
                />
              ) : (
                <Name>{sysvar.name}</Name>
              )}
              <Controls>
                <SysvarControl
                  sysvar={sysvar}
                  onSet={(value) =>
                    action.mutate(
                      { type: 'setSysvar', id: sysvar.id, value },
                      { onError: (error) => showToast(`${m.SET_FAILED()}: ${error.message}`) },
                    )
                  }
                />
              </Controls>
            </Item>
          ))}
      </List>
      {creating && <NewSysvarDialog onClose={() => setCreating(false)} />}
      {deleting && (
        <ConfirmDialog
          title={m.DELETE_NAMED({ name: deleting.name })}
          confirmLabel={m.DELETE()}
          destructive
          busy={change.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => runChange({ type: 'deleteSysvar', id: deleting.id }, m.DELETED_OBJECT(), () => setDeleting(null))}
        >
          <p>{m.DELETE_SYSVAR_CONFIRM({ name: deleting.name })}</p>
        </ConfirmDialog>
      )}
    </Container>
  );
};

export const Programs = () => {
  const { showToast } = useToast();
  const { userLevel, elevated } = useWebSocketContext();
  const { data: programs = [] } = usePrograms();
  const action = useLogicAction();
  const canConfigure = userLevel === 'admin' && elevated;
  usePageTitle(m.PROGRAMS());

  const run = (variables: Parameters<typeof action.mutate>[0], success?: string) =>
    action.mutate(variables, {
      onSuccess: () => success && showToast(success, 'info'),
      onError: (error) => showToast(`${m.SET_FAILED()}: ${error.message}`),
    });

  return (
    <Container>
      <List aria-label={m.PROGRAMS()}>
        {programs
          .filter((p) => p.visible)
          .map((program) => (
            <Item key={program.id}>
              <Name>
                {program.name} {!program.active && <Badge>{m.INACTIVE()}</Badge>}
              </Name>
              <Controls>
                {canConfigure && (
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={program.active}
                      aria-label={`${m.ACTIVE()} ${program.name}`}
                      onChange={(event) => run({ type: 'setProgramActive', id: program.id, active: event.target.checked })}
                    />
                    {m.ACTIVE()}
                  </label>
                )}
                <DialogButton
                  type="button"
                  aria-label={`${m.RUN()} ${program.name}`}
                  onClick={() => run({ type: 'runProgram', id: program.id }, m.PROGRAM_RUN())}
                >
                  {m.RUN()}
                </DialogButton>
              </Controls>
            </Item>
          ))}
      </List>
    </Container>
  );
};
