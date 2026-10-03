import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { useLogicAction, usePrograms, useSysvars } from '../queries';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { Sysvar } from '../types/types';
import { DialogButton } from '../components/ConfirmDialog';
import { m } from '../paraglide/messages';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
  padding-top: 76px;
  color: ${(props) => props.theme.colors.text};
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  overflow: hidden;
  background: ${(props) => props.theme.colors.surface};
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  &:last-of-type {
    border-bottom: none;
  }
`;

const Name = styled.span`
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const Controls = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const Toggle = styled.button<{ on: boolean; alarm?: boolean }>`
  font: inherit;
  padding: 6px 12px;
  border-radius: 16px;
  border: none;
  cursor: pointer;
  color: #fff;
  background: ${({ on, alarm }) => (on ? (alarm ? '#c62828' : '#43a047') : '#757575')};
`;

const Input = styled.input`
  font: inherit;
  width: 110px;
  padding: 6px 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 6px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.background};
`;

const Badge = styled.span`
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(158, 158, 158, 0.3);
`;

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
