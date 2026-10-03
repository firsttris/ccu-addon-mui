import styled from '@emotion/styled';
import { useRevokeSession, useSessions } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { defaultLang, useTranslations } from '../../i18n/utils';
import { DialogButton } from '../../components/ConfirmDialog';

const Panel = styled.section`
  margin: 16px 0;
  padding: 12px 16px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  background: ${(props) => props.theme.colors.surface};
  overflow-x: auto;

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid ${(props) => props.theme.colors.border};
    white-space: nowrap;
  }
`;

const dateFormat = new Intl.DateTimeFormat(defaultLang, { dateStyle: 'medium', timeStyle: 'short' });

// Devices logged in to the add-on; a lost tablet can be logged out here
export const Sessions = () => {
  const t = useTranslations();
  const { showToast } = useToast();
  const { data: sessions = [] } = useSessions({ enabled: true });
  const revoke = useRevokeSession();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Panel aria-label={t('SESSIONS')}>
      <h2>{t('SESSIONS')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('SESSION_DEVICE')}</th>
            <th>{t('SESSION_USER')}</th>
            <th>{t('SESSION_LAST_USED')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>
                {session.device}
                {session.current ? ` (${t('THIS_DEVICE')})` : ''}
              </td>
              <td>{session.user}</td>
              <td>{dateFormat.format(new Date(session.lastUsed))}</td>
              <td>
                {!session.current && (
                  <DialogButton
                    type="button"
                    aria-label={`${t('LOG_OUT_DEVICE')} ${session.device}`}
                    onClick={() =>
                      revoke.mutate(session.id, {
                        onSuccess: () => showToast(t('DEVICE_LOGGED_OUT'), 'info'),
                        onError: (error) => showToast(`${t('CHANGE_FAILED')}: ${error.message}`),
                      })
                    }
                  >
                    {t('LOG_OUT_DEVICE')}
                  </DialogButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};
