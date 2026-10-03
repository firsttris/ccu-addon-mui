import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import { useLogicAction, usePrograms, useSysvars } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { Sysvar } from '../types/types';
import { DialogButton } from '../components/ConfirmDialog';
import { m } from '../paraglide/messages';

type Children = { children: ReactNode };

const Container = ({ children }: Children) => (
  <div className="max-w-[800px] mx-auto p-4 pt-[76px] text-foreground">{children}</div>
);

const List = (props: HTMLAttributes<HTMLUListElement>) => (
  <ul className="list-none m-0 p-0 border border-solid border-border rounded-lg overflow-hidden bg-card" {...props} />
);

const Item = ({ children }: Children) => (
  <li className="flex items-center justify-between gap-3 py-[10px] px-4 border-b border-border last-of-type:border-b-0">
    {children}
  </li>
);

const Name = ({ children }: Children) => <span className="font-semibold min-w-0 wrap-anywhere">{children}</span>;

const Controls = ({ children }: Children) => <span className="flex items-center gap-2 shrink-0">{children}</span>;

const Toggle = ({ on, alarm, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; alarm?: boolean }) => (
  <button
    className={`[font:inherit] py-[6px] px-3 rounded-2xl border-none cursor-pointer text-white ${
      on ? (alarm ? 'bg-[#c62828]' : 'bg-[#43a047]') : 'bg-[#757575]'
    }`}
    {...props}
  />
);

const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className="[font:inherit] w-[110px] py-[6px] px-2 border border-solid border-border rounded-md text-foreground bg-background"
    {...props}
  />
);

const Badge = ({ children }: Children) => (
  <span className="text-[12px] py-[2px] px-2 rounded-[10px] bg-[rgba(158,158,158,0.3)]">{children}</span>
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

const SysvarControl = ({ sysvar, onSet }: { sysvar: Sysvar; onSet: (value: string | number | boolean) => void }) => {
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
        <select
          aria-label={sysvar.name}
          value={typeof sysvar.value === 'number' ? sysvar.value : ''}
          onChange={(event) => onSet(Number(event.target.value))}
        >
          {(sysvar.valueList ?? []).map((option, index) => (
            <option key={`${index}-${option}`} value={index}>
              {option}
            </option>
          ))}
        </select>
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
          {sysvar.unit}
        </>
      );
    default:
      return <DraftInput label={sysvar.name} value={String(sysvar.value ?? '')} onCommit={(draft) => onSet(draft)} />;
  }
};

export const Sysvars = () => {
  const { showToast } = useToast();
  const { data: sysvars = [] } = useSysvars();
  const action = useLogicAction();

  return (
    <Container>
      <h1>{m.SYSVARS()}</h1>
      <List aria-label={m.SYSVARS()}>
        {sysvars
          .filter((sv) => sv.visible)
          .map((sysvar) => (
            <Item key={sysvar.id}>
              <Name>{sysvar.name}</Name>
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
    </Container>
  );
};

export const Programs = () => {
  const { showToast } = useToast();
  const { userLevel, elevated } = useWebSocketContext();
  const { data: programs = [] } = usePrograms();
  const action = useLogicAction();
  const canConfigure = userLevel === 'admin' && elevated;

  const run = (variables: Parameters<typeof action.mutate>[0], success?: string) =>
    action.mutate(variables, {
      onSuccess: () => success && showToast(success, 'info'),
      onError: (error) => showToast(`${m.SET_FAILED()}: ${error.message}`),
    });

  return (
    <Container>
      <h1>{m.PROGRAMS()}</h1>
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
                  <label>
                    <input
                      type="checkbox"
                      checked={program.active}
                      aria-label={`${m.ACTIVE()} ${program.name}`}
                      onChange={(event) => run({ type: 'setProgramActive', id: program.id, active: event.target.checked })}
                    />{' '}
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
