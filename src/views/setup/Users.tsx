import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import UserPlusIcon from '~icons/lucide/user-plus';
import { RequestError, useWebSocketActions } from '../../hooks/useWebsocket';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { TableSkeletonRows } from '../../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Panel } from './Panel';
import { m } from '../../paraglide/messages';
import type { CcuUser } from '../../types/protocol';

type Level = 'admin' | 'user' | 'guest';

// The WebUI's checks (webui.js): isPasswordAllowed (here without umlauts)
// and isTextAllowed
export const passwordAllowed = (password: string) => /^[a-zA-Z0-9.=!$():;#*-]*$/.test(password);
export const textAllowed = (text: string) => !/[<>'"&$[\]{}\\^]/.test(text);

const levelLabel = (level: string) =>
  level === 'admin' ? m.USERS_LEVEL_ADMIN() : level === 'user' ? m.USERS_LEVEL_USER() : m.USERS_LEVEL_GUEST();

const displayName = (user: CcuUser) => [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name;

const useUsers = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => (await request({ type: 'getUsers' })).users,
    retry: false,
  });
};

const errorText = (error: unknown) => {
  if (error instanceof RequestError && error.code === 'EXISTS') return m.USERS_EXISTS();
  return `${m.CHANGE_FAILED()}: ${(error as Error).message}`;
};

// The CCU users with their rights, as the WebUI's user administration
// (userAdministration.htm, userAccountConfigAdmin.htm)
export const Users = () => {
  usePageTitle(m.SETUP());
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: users = [], isPending: loading } = useUsers();
  const [editing, setEditing] = useState<CcuUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CcuUser | null>(null);

  const remove = async (user: CcuUser) => {
    try {
      await request({ type: 'deleteUser', id: user.id }, { queue: false });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(m.USERS_DELETED(), 'info');
    } catch (error) {
      showToast(errorText(error));
    }
    setDeleting(null);
  };

  return (
    <Panel aria-label={m.USERS()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>{m.USERS()}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new')}>
          <UserPlusIcon />
          {m.USERS_NEW()}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>{m.USERS_NAME()}</TableHead>
              <TableHead className="hidden sm:table-cell">{m.USERS_LEVEL()}</TableHead>
              <TableHead className="hidden sm:table-cell">{m.PASSWORD()}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableSkeletonRows columns={4} rows={3} />}
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {displayName(user)}
                  {user.name !== displayName(user).replace(/\s/g, '') && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{user.name}</span>
                  )}
                  <span className="block text-xs font-normal text-muted-foreground sm:hidden">{levelLabel(user.level)}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={user.level === 'admin' ? 'default' : 'secondary'}>{levelLabel(user.level)}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {user.hasPassword ? m.USERS_PASSWORD_SET() : m.USERS_NO_PASSWORD()}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <DialogButton
                      type="button"
                      className="h-8"
                      aria-label={`${m.EDIT()} ${user.name}`}
                      onClick={() => setEditing(user)}
                    >
                      {m.EDIT()}
                    </DialogButton>
                    {user.deletable && (
                      <DialogButton
                        type="button"
                        className="h-8"
                        aria-label={`${m.DELETE()} ${user.name}`}
                        onClick={() => setDeleting(user)}
                      >
                        {m.DELETE()}
                      </DialogButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs">{m.USERS_HINT()}</p>

      {editing && <UserDialog user={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={m.USERS_DELETE_TITLE()}
          confirmLabel={m.DELETE()}
          destructive
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        >
          {m.USERS_DELETE_CONFIRM({ name: deleting.name })}
        </ConfirmDialog>
      )}
    </Panel>
  );
};

const UserDialog = ({ user, onDone }: { user: CcuUser | null; onDone: () => void }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user ? displayName(user) : '');
  const [level, setLevel] = useState<Level>((user?.level as Level) || 'user');
  const [showLogin, setShowLogin] = useState(user?.showLogin ?? true);
  const [mail, setMail] = useState(user?.mail ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [changePassword, setChangePassword] = useState(!user);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    fullName.trim() === ''
      ? m.USERS_NAME_REQUIRED()
      : !textAllowed(fullName) || !textAllowed(mail) || !textAllowed(phone)
        ? m.USERS_FORBIDDEN_CHARS()
        : changePassword && !passwordAllowed(password)
          ? m.USERS_PASSWORD_CHARS()
          : changePassword && password !== repeat
            ? m.USERS_PASSWORD_MISMATCH()
            : null;

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request(
        {
          type: 'saveUser',
          id: user?.id ?? 0,
          fullName: fullName.trim(),
          level,
          showLogin,
          mail,
          phone,
          ...(changePassword ? { password } : {}),
        },
        { queue: false },
      );
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(m.SAVED(), 'info');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const field = 'flex flex-col gap-1';
  const label = 'text-xs text-muted-foreground';
  return (
    <ConfirmDialog
      title={user ? m.USERS_EDIT_TITLE() : m.USERS_NEW()}
      confirmLabel={m.SAVE()}
      busy={busy}
      onConfirm={save}
      onCancel={onDone}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) save();
        }}
      >
        <label className={field}>
          <span className={label}>{m.USERS_NAME()}</span>
          <Input aria-label={m.USERS_NAME()} value={fullName} autoFocus={!user} onChange={(e) => setFullName(e.target.value)} />
          <span className="text-xs text-muted-foreground">
            {m.USERS_LOGIN_NAME({ name: fullName.replace(/\s/g, '') || '–' })}
          </span>
        </label>
        <label className={field}>
          <span className={label}>{m.USERS_LEVEL()}</span>
          <NativeSelect aria-label={m.USERS_LEVEL()} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            <option value="admin">{m.USERS_LEVEL_ADMIN()}</option>
            <option value="user">{m.USERS_LEVEL_USER()}</option>
            <option value="guest">{m.USERS_LEVEL_GUEST()}</option>
          </NativeSelect>
        </label>
        {user && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={changePassword} onChange={(e) => setChangePassword(e.target.checked)} />
            {m.USERS_CHANGE_PASSWORD()}
          </label>
        )}
        {changePassword && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={field}>
              <span className={label}>{m.PASSWORD()}</span>
              <Input
                type="password"
                aria-label={m.PASSWORD()}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className={field}>
              <span className={label}>{m.USERS_PASSWORD_REPEAT()}</span>
              <Input
                type="password"
                aria-label={m.USERS_PASSWORD_REPEAT()}
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            <span className="text-xs text-muted-foreground sm:col-span-2">{m.USERS_PASSWORD_HINT()}</span>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showLogin} onChange={(e) => setShowLogin(e.target.checked)} />
          {m.USERS_SHOW_LOGIN()}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className={label}>{m.USERS_MAIL()}</span>
            <Input type="email" aria-label={m.USERS_MAIL()} value={mail} onChange={(e) => setMail(e.target.value)} />
          </label>
          <label className={field}>
            <span className={label}>{m.USERS_PHONE()}</span>
            <Input type="tel" aria-label={m.USERS_PHONE()} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        {/* Enter submits */}
        <button type="submit" hidden />
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>
    </ConfirmDialog>
  );
};
