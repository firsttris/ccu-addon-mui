import { ReactNode, useEffect, useRef, useState } from 'react';
import DownloadIcon from '~icons/lucide/arrow-down-to-line';
import ShieldCheckIcon from '~icons/lucide/shield-check';
import PackageOpenIcon from '~icons/lucide/package-open';
import CogIcon from '~icons/lucide/cog';
import RefreshIcon from '~icons/lucide/refresh-cw';
import SparklesIcon from '~icons/lucide/sparkles';
import CheckIcon from '~icons/lucide/check';
import XIcon from '~icons/lucide/x';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { ElevateDialog } from '../ElevateDialog';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { onSelfUpdateProgress } from '../../lib/selfUpdateProgress';
import { takeOverNewApp, takeOverNow } from '../../lib/appUpdate';
import { errorText } from '../../lib/errors';
import { useEffects } from '../../contexts/EffectsContext';
import { cn } from '../../lib/utils';
import { m } from '../../paraglide/messages';

// Download, check and the update script take seconds, on a slow line minutes
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
// The update script restarts the server a few seconds after the answer
const DISCONNECT_WAIT_MS = 15_000;
const RECONNECT_WAIT_MS = 2 * 60 * 1000;

type Step = 'download' | 'verify' | 'unpack' | 'install' | 'restart' | 'app';
const STEPS: Step[] = ['download', 'verify', 'unpack', 'install', 'restart', 'app'];

const stepLabel: Record<Step, () => string> = {
  download: m.UPDATE_STEP_DOWNLOAD,
  verify: m.UPDATE_STEP_VERIFY,
  unpack: m.UPDATE_STEP_UNPACK,
  install: m.UPDATE_STEP_INSTALL,
  restart: m.UPDATE_STEP_RESTART,
  app: m.UPDATE_STEP_APP,
};

// Each step has its picture, which moves while the step runs
const stepIcon: Record<Step, { icon: ReactNode; motion: string }> = {
  download: { icon: <DownloadIcon />, motion: 'animate-bounce' },
  verify: { icon: <ShieldCheckIcon />, motion: 'fx-pulse' },
  unpack: { icon: <PackageOpenIcon />, motion: 'fx-pulse' },
  install: { icon: <CogIcon />, motion: 'animate-spin [animation-duration:2.5s]' },
  restart: { icon: <RefreshIcon />, motion: 'animate-spin [animation-duration:1.4s]' },
  app: { icon: <SparklesIcon />, motion: 'fx-pulse' },
};

type State = 'confirm' | 'elevate' | 'running' | 'otherTabs' | 'appFailed' | 'error';

const installError = (error: unknown) =>
  errorText(error, m.SELF_UPDATE_FAILED, {
    CHECKSUM: m.SELF_UPDATE_CHECKSUM,
    UPDATE_RUNNING: m.SELF_UPDATE_ALREADY_RUNNING,
  });

const megabytes = (bytes: number) =>
  (bytes / 1024 / 1024).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const StepRow = ({
  step,
  status,
  children,
}: {
  step: Step;
  status: 'pending' | 'active' | 'done' | 'failed';
  children?: ReactNode;
}) => {
  const effects = useEffects();
  const { icon, motion } = stepIcon[step];
  return (
    <li className="flex items-start gap-3" aria-current={status === 'active' ? 'step' : undefined}>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 [&_svg]:size-[18px]',
          status === 'pending' && 'border-border text-muted-foreground/50',
          status === 'active' && 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300',
          status === 'done' && 'border-green-500/40 bg-green-500/15 text-green-600 dark:text-green-300',
          status === 'failed' && 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400',
        )}
      >
        {status === 'done' ? (
          <CheckIcon className={cn(effects.on && 'fx-bloom')} />
        ) : status === 'failed' ? (
          <XIcon />
        ) : (
          <span className={cn('flex', status === 'active' && effects.on && motion)}>{icon}</span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-2">
        <span
          className={cn(
            'text-sm leading-none',
            status === 'pending' ? 'text-muted-foreground' : 'font-medium',
            status === 'failed' && 'text-red-600 dark:text-red-400',
          )}
        >
          {stepLabel[step]()}
        </span>
        {children}
      </div>
    </li>
  );
};

// Installs the newest release of this add-on step by step, as the server
// reports them (selfUpdateProgress), waits for the server to come back with
// the new version and brings this tab to the new app (takeOverNewApp):
// after the reload UpdateDone says it is done. Started from the update
// notice and from the system page.
export const UpdateWizard = ({ version, onClose }: { version: string; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const { elevated, connectionStatus } = useWebSocketContext();
  const [state, setState] = useState<State>('confirm');
  const [step, setStep] = useState<Step>('download');
  const [bytes, setBytes] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // The connection as a ref: the wait for the restart reads it in a loop
  const status = useRef(connectionStatus);
  status.current = connectionStatus;
  const waitFor = async (open: boolean, timeoutMs: number) => {
    const end = Date.now() + timeoutMs;
    while ((status.current === 'Open') !== open) {
      if (Date.now() > end) return false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return true;
  };

  useEffect(
    () =>
      onSelfUpdateProgress((progress) => {
        setStep(progress.phase);
        if (progress.phase === 'download') setBytes({ done: progress.done ?? 0, total: progress.total ?? 0 });
      }),
    [],
  );

  const run = async () => {
    setState('running');
    setStep('download');
    setError(null);
    try {
      await request({ type: 'installSelfUpdate' }, { queue: false, timeoutMs: INSTALL_TIMEOUT_MS });
    } catch (e) {
      setError(installError(e));
      setState('error');
      return;
    }
    // Installed: the server restarts. Wait until it is gone and back, and
    // runs the new version, before the app looks for the new one.
    setStep('restart');
    await waitFor(false, DISCONNECT_WAIT_MS);
    if (!(await waitFor(true, RECONNECT_WAIT_MS))) {
      setError(m.UPDATE_NOT_BACK());
      setState('error');
      return;
    }
    let running = '';
    for (let attempt = 0; attempt < 5 && running !== version; attempt++) {
      try {
        running = (await request({ type: 'checkSelfUpdate' }, { timeoutMs: 30000 })).current;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (running !== version) {
      setError(m.UPDATE_WRONG_VERSION({ version, running: running || '?' }));
      setState('error');
      return;
    }
    setStep('app');
    const result = await takeOverNewApp(version);
    if (result === 'otherTabs') setState('otherTabs');
    if (result === 'failed') setState('appFailed');
  };

  const start = () => (elevated ? run() : setState('elevate'));

  if (state === 'elevate') {
    return <ElevateDialog onDone={run} onCancel={onClose} />;
  }

  const busy = state === 'running';
  const current = STEPS.indexOf(step);
  const statusOf = (s: Step) => {
    const i = STEPS.indexOf(s);
    if (state === 'error' && i === current) return 'failed';
    if (state === 'otherTabs' || state === 'appFailed') return s === 'app' ? 'active' : 'done';
    return i < current ? 'done' : i === current ? 'active' : 'pending';
  };
  const percent = bytes.total > 0 ? Math.min(100, Math.round((bytes.done / bytes.total) * 100)) : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={!busy} onInteractOutside={(e) => busy && e.preventDefault()} onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{m.UPDATE_TITLE({ version })}</DialogTitle>
          <DialogDescription>{state === 'confirm' ? m.UPDATE_CONFIRM() : m.UPDATE_RUNNING_HINT()}</DialogDescription>
        </DialogHeader>

        {state !== 'confirm' && (
          <ol className="flex flex-col gap-3" aria-label={m.UPDATE_STEPS()}>
            {STEPS.map((s) => (
              <StepRow key={s} step={s} status={statusOf(s)}>
                {s === 'download' && statusOf('download') === 'active' && (
                  <div className="flex items-center gap-2">
                    <div
                      role="progressbar"
                      aria-label={m.UPDATE_STEP_DOWNLOAD()}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={cn('h-full rounded-full bg-sky-500 transition-[width] duration-200', percent === undefined && 'w-1/3 animate-pulse')}
                        style={percent !== undefined ? { width: `${percent}%` } : undefined}
                      />
                    </div>
                    <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                      {percent !== undefined ? `${megabytes(bytes.done)} / ${megabytes(bytes.total)} MB` : ''}
                    </span>
                  </div>
                )}
              </StepRow>
            ))}
          </ol>
        )}

        {state === 'otherTabs' && (
          <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {m.UPDATE_OTHER_TABS()}
          </p>
        )}
        {state === 'appFailed' && (
          <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {m.UPDATE_APP_FAILED()}
          </p>
        )}
        {state === 'error' && error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        <DialogFooter>
          {state === 'confirm' && (
            <>
              <Button variant="outline" onClick={onClose}>
                {m.CANCEL()}
              </Button>
              <Button onClick={start}>{m.SELF_UPDATE_INSTALL()}</Button>
            </>
          )}
          {state === 'otherTabs' && <Button onClick={() => void takeOverNow()}>{m.UPDATE_RELOAD_NOW()}</Button>}
          {(state === 'appFailed' || state === 'error') && (
            <Button variant="outline" onClick={onClose}>
              {m.CLOSE()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
