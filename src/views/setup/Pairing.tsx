import styled from '@emotion/styled';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInbox, useInstallMode, usePairingAction } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';

const Panel = styled.section`
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  background: ${(props) => props.theme.colors.surface};

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin: 8px 0;
`;

const Select = styled.select`
  font: inherit;
  padding: 6px;
`;

const Inbox = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid ${(props) => props.theme.colors.border};
  }

  a {
    color: inherit;
    font-weight: 600;
  }
`;

const INTERFACES = ['HmIP-RF', 'BidCos-RF'];
const PAIRING_SECONDS = 60;

// Pairing new devices and accepting them from the inbox
export const Pairing = () => {
  const { showToast } = useToast();
  const [interfaceName, setInterfaceName] = useState(INTERFACES[0]);
  const [started, setStarted] = useState(false);
  const { data: seconds = 0 } = useInstallMode(interfaceName, { poll: started });
  const active = seconds > 0;
  const { data: inbox = [] } = useInbox({ poll: started && active });
  const action = usePairingAction();

  const run = (variables: Parameters<typeof action.mutate>[0], success?: string) =>
    action.mutate(variables, {
      onSuccess: () => success && showToast(success, 'info'),
      onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    });

  return (
    <Panel aria-label={m.PAIRING()}>
      <h2>{m.PAIRING()}</h2>
      <p>{m.PAIRING_HINT()}</p>
      <Row>
        <Select aria-label={m.INTERFACE()} value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)}>
          {INTERFACES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </Select>
        {active ? (
          <>
            <span role="status">
              {m.PAIRING_ACTIVE()}: {seconds} s
            </span>
            <DialogButton
              type="button"
              onClick={() => run({ type: 'setInstallMode', interfaceName, on: false, seconds: 0 })}
            >
              {m.STOP_PAIRING()}
            </DialogButton>
          </>
        ) : (
          <DialogButton
            type="button"
            primary
            onClick={() => {
              setStarted(true);
              run({ type: 'setInstallMode', interfaceName, on: true, seconds: PAIRING_SECONDS });
            }}
          >
            {m.START_PAIRING()}
          </DialogButton>
        )}
      </Row>

      <h2>{m.INBOX()}</h2>
      {inbox.length === 0 ? (
        <p>{m.INBOX_EMPTY()}</p>
      ) : (
        <Inbox aria-label={m.INBOX()}>
          {inbox.map((device) => (
            <li key={device.address}>
              <span>
                <Link to="/device/$interfaceName/$address" params={{ interfaceName: device.interfaceName, address: device.address }}>
                  {device.name}
                </Link>{' '}
                ({device.type})
              </span>
              <DialogButton type="button" onClick={() => run({ type: 'acceptDevice', address: device.address }, m.ACCEPTED())}>
                {m.ACCEPT()}
              </DialogButton>
            </li>
          ))}
        </Inbox>
      )}
    </Panel>
  );
};
