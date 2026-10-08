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
import { HeroTone, updateButton, UpdateHero, VersionJump } from './UpdateHero';

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

type StepStatus = 'pending' | 'active' | 'done' | 'failed';

// One step in the list: a dot on a rail that fills as the steps get done
const StepRow = ({ step, status, last }: { step: Step; status: StepStatus; last: boolean }) => {
  const effects = useEffects();
  const { icon, motion } = stepIcon[step];
  return (
    <li className="relative flex items-center gap-3 pb-2.5 last:pb-0" aria-current={status === 'active' ? 'step' : undefined}>
      {!last && (
        <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-0.5 overflow-hidden rounded-full bg-border">
          <span
            className={cn(
              'block size-full origin-top bg-gradient-to-b from-green-500 to-emerald-400 transition-transform duration-500 ease-out',
              status === 'done' ? 'scale-y-100' : 'scale-y-0',
            )}
          />
        </span>
      )}
      <span
        className={cn(
          'relative flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 [&_svg]:size-3.5',
          status === 'pending' && 'border-border bg-background text-muted-foreground/60',
          status === 'active' && 'border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-300',
          status === 'done' && 'border-transparent bg-green-500 text-white shadow-sm shadow-green-500/30',
          status === 'failed' && 'border-transparent bg-red-500 text-white',
        )}
      >
        {status === 'active' && effects.on && <span aria-hidden className="fx-wave absolute inset-0 rounded-full border-2 border-sky-500/40" />}
        {status === 'done' ? (
          <CheckIcon className={cn('[stroke-width:3]', effects.on && 'fx-bloom')} />
        ) : status === 'failed' ? (
          <XIcon className="[stroke-width:3]" />
        ) : (
          <span className={cn('flex', status === 'active' && effects.on && motion)}>{icon}</span>
        )}
      </span>
      <span
        className={cn(
          'text-sm transition-colors duration-300',
          status === 'pending' && 'text-muted-foreground',
          status === 'active' && 'font-semibold',
          status === 'done' && 'text-foreground/80',
          status === 'failed' && 'font-semibold text-red-600 dark:text-red-400',
        )}
      >
        {stepLabel[step]()}
      </span>
    </li>
  );
};

// Installs the newest release of this add-on step by step, as the server
// reports them (selfUpdateProgress), waits for the server to come back with
// the new version and brings this tab to the new app (takeOverNewApp):
// after the reload UpdateDone says it is done. Started from the update
// notice and from the system page.
export const UpdateWizard = ({ version, current, onClose }: { version: string; current?: string; onClose: () => void }) => {
  const effects = useEffects();
  const { request } = useWebSocketActions();
  const { elevated, connectionStatus } = useWebSocketContext();
  const [state, setState] = useState<State>('confirm');
  const [step, setStep] = useState<Step>('download');
  const [bytes, setBytes] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

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
  const index = STEPS.indexOf(step);
  const statusOf = (s: Step): StepStatus => {
    const i = STEPS.indexOf(s);
    if (state === 'error' && i === index) return 'failed';
    if (state === 'otherTabs' || state === 'appFailed') return s === 'app' ? 'active' : 'done';
    return i < index ? 'done' : i === index ? 'active' : 'pending';
  };
  const percent = bytes.total > 0 ? Math.min(100, Math.round((bytes.done / bytes.total) * 100)) : undefined;
  const downloading = state === 'running' && step === 'download';

  // The ring over the whole update: each step a sixth, the download by its bytes
  const within = step === 'download' ? (percent ?? 0) / 100 : 0.5;
  const progress = state === 'confirm' ? 0 : (index + within) / STEPS.length;
  const tone: HeroTone = state === 'error' ? 'red' : state === 'otherTabs' || state === 'appFailed' ? 'amber' : 'sky';
  const hero =
    state === 'confirm'
      ? { key: 'confirm', ...stepIcon.download, motion: 'animate-bounce' }
      : state === 'error'
        ? { key: 'error', icon: <XIcon />, motion: '' }
        : { key: step, ...stepIcon[step] };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        showCloseButton={!busy}
        onInteractOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmButton.current?.focus();
        }}
        className="gap-5 overflow-hidden outline-none sm:max-w-md"
      >
        {effects.on && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-sky-500/10 via-violet-500/5 to-transparent"
          />
        )}
        <DialogHeader className="relative items-center text-center sm:items-center sm:text-center">
          <DialogTitle>{m.UPDATE_TITLE({ version })}</DialogTitle>
          <DialogDescription>{state === 'confirm' ? m.UPDATE_CONFIRM() : m.UPDATE_RUNNING_HINT()}</DialogDescription>
        </DialogHeader>

        <UpdateHero
          icon={hero.icon}
          iconKey={hero.key}
          motion={hero.motion}
          progress={progress}
          tone={tone}
          running={busy}
        />

        {state === 'confirm' ? (
          current && <VersionJump from={current} to={version} />
        ) : (
          <div className="-mt-1 flex flex-col items-center gap-2 text-center">
            <span key={step} className={cn('text-base font-semibold', effects.on && 'fx-rise-a')}>
              {state === 'error' ? m.SELF_UPDATE_FAILED() : stepLabel[step]()}
            </span>
            {downloading ? (
              <div className="flex w-full max-w-64 flex-col gap-1.5">
                <div
                  role="progressbar"
                  aria-label={m.UPDATE_STEP_DOWNLOAD()}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="relative h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      'relative h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-400 to-violet-500 transition-[width] duration-300 ease-out',
                      percent === undefined && 'w-1/3 animate-pulse',
                    )}
                    style={percent !== undefined ? { width: `${percent}%` } : undefined}
                  >
                    {effects.on && <span className="fx-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent" />}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {percent !== undefined ? `${megabytes(bytes.done)} / ${megabytes(bytes.total)} MB · ${percent} %` : '\u00a0'}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">
                {m.UPDATE_STEP_OF({ step: index + 1, total: STEPS.length })}
              </span>
            )}
          </div>
        )}

        {state !== 'confirm' && (
          <ol className="rounded-xl border bg-muted/30 p-3.5" aria-label={m.UPDATE_STEPS()}>
            {STEPS.map((s, i) => (
              <StepRow key={s} step={s} status={statusOf(s)} last={i === STEPS.length - 1} />
            ))}
          </ol>
        )}

        {state === 'otherTabs' && (
          <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {m.UPDATE_OTHER_TABS()}
          </p>
        )}
        {state === 'appFailed' && (
          <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            {m.UPDATE_APP_FAILED()}
          </p>
        )}
        {state === 'error' && error && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}

        {state !== 'running' && (
          <DialogFooter className="sm:justify-center">
            {state === 'confirm' && (
              <>
                <Button variant="outline" onClick={onClose}>
                  {m.CANCEL()}
                </Button>
                <Button ref={confirmButton} onClick={start} className={updateButton}>
                  <DownloadIcon />
                  {m.SELF_UPDATE_INSTALL()}
                </Button>
              </>
            )}
            {state === 'otherTabs' && (
              <Button onClick={() => void takeOverNow()} className="press">
                <RefreshIcon />
                {m.UPDATE_RELOAD_NOW()}
              </Button>
            )}
            {(state === 'appFailed' || state === 'error') && (
              <Button variant="outline" onClick={onClose}>
                {m.CLOSE()}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
