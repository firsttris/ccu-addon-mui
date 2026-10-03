import styled from '@emotion/styled';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInbox, useInstallMode, usePairingAction } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { useTranslations } from '../../i18n/utils';
import { DialogButton } from '../../components/ConfirmDialog';

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
  const t = useTranslations();
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
      onError: (error) => showToast(`${t('CHANGE_FAILED')}: ${error.message}`),
    });

  return (
    <Panel aria-label={t('PAIRING')}>
      <h2>{t('PAIRING')}</h2>
      <p>{t('PAIRING_HINT')}</p>
      <Row>
        <Select aria-label={t('INTERFACE')} value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)}>
          {INTERFACES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </Select>
        {active ? (
          <>
            <span role="status">
              {t('PAIRING_ACTIVE')}: {seconds} s
            </span>
            <DialogButton
              type="button"
              onClick={() => run({ type: 'setInstallMode', interfaceName, on: false, seconds: 0 })}
            >
              {t('STOP_PAIRING')}
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
            {t('START_PAIRING')}
          </DialogButton>
        )}
      </Row>

      <h2>{t('INBOX')}</h2>
      {inbox.length === 0 ? (
        <p>{t('INBOX_EMPTY')}</p>
      ) : (
        <Inbox aria-label={t('INBOX')}>
          {inbox.map((device) => (
            <li key={device.address}>
              <span>
                <Link to="/device/$interfaceName/$address" params={{ interfaceName: device.interfaceName, address: device.address }}>
                  {device.name}
                </Link>{' '}
                ({device.type})
              </span>
              <DialogButton type="button" onClick={() => run({ type: 'acceptDevice', address: device.address }, t('ACCEPTED'))}>
                {t('ACCEPT')}
              </DialogButton>
            </li>
          ))}
        </Inbox>
      )}
    </Panel>
  );
};
