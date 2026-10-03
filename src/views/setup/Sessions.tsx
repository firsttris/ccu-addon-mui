import { Panel } from './Panel';
import { useRevokeSession, useSessions } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { defaultLang } from '../../i18n/utils';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { usePageTitle } from '../../contexts/PageTitleContext';

const dateFormat = new Intl.DateTimeFormat(defaultLang, { dateStyle: 'medium', timeStyle: 'short' });

// Devices logged in to the add-on; a lost tablet can be logged out here
export const Sessions = () => {
  usePageTitle(m.SETUP());
  const { showToast } = useToast();
  const { data: sessions = [] } = useSessions({ enabled: true });
  const revoke = useRevokeSession();

  if (sessions.length === 0) {
    return null;
  }

  return (
    <Panel aria-label={m.SESSIONS()}>
      <h2>{m.SESSIONS()}</h2>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>{m.SESSION_DEVICE()}</TableHead>
              <TableHead>{m.SESSION_USER()}</TableHead>
              <TableHead>{m.SESSION_LAST_USED()}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">
                  {session.device}
                  {session.current && (
                    <Badge variant="secondary" className="ml-2">
                      {m.THIS_DEVICE()}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{session.user}</TableCell>
                <TableCell className="text-muted-foreground">{dateFormat.format(new Date(session.lastUsed))}</TableCell>
                <TableCell className="text-right">
                  {!session.current && (
                    <DialogButton
                      type="button"
                      className="h-8"
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
};
