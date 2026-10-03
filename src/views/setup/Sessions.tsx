import { Panel } from './Panel';
import { useRevokeSession, useSessions } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { defaultLang } from '../../i18n/utils';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';

const dateFormat = new Intl.DateTimeFormat(defaultLang, { dateStyle: 'medium', timeStyle: 'short' });

// Devices logged in to the add-on; a lost tablet can be logged out here
export const Sessions = () => {
  const { showToast } = useToast();
  const { data: sessions = [] } = useSessions({ enabled: true });
  const revoke = useRevokeSession();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Panel
      aria-label={m.SESSIONS()}
      className="overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px] [&_:is(th,td)]:text-left [&_:is(th,td)]:py-[6px] [&_:is(th,td)]:px-2 [&_:is(th,td)]:border-b [&_:is(th,td)]:border-border [&_:is(th,td)]:whitespace-nowrap"
    >
      <h2>{m.SESSIONS()}</h2>
      <table>
        <thead>
          <tr>
            <th>{m.SESSION_DEVICE()}</th>
            <th>{m.SESSION_USER()}</th>
            <th>{m.SESSION_LAST_USED()}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>
                {session.device}
                {session.current ? ` (${m.THIS_DEVICE()})` : ''}
              </td>
              <td>{session.user}</td>
              <td>{dateFormat.format(new Date(session.lastUsed))}</td>
              <td>
                {!session.current && (
                  <DialogButton
                    type="button"
                    aria-label={`${m.LOG_OUT_DEVICE()} ${session.device}`}
                    onClick={() =>
                      revoke.mutate(session.id, {
                        onSuccess: () => showToast(m.DEVICE_LOGGED_OUT(), 'info'),
                        onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
                      })
                    }
                  >
                    {m.LOG_OUT_DEVICE()}
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
