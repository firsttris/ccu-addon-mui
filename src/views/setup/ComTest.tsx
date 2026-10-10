import { useEffect, useRef, useState } from 'react';
import ActivityIcon from '~icons/lucide/activity';
import { useWebSocketActions } from '../../hooks/useWebsocket';
import { Button } from '../../components/ui/button';
import { m } from '../../paraglide/messages';

// The WebUI polls every 3 s (DeviceConfigDialog.POLL_INTERVAL); after a
// minute without an answer the test is given up here
const POLL_MS = 3000;
const GIVE_UP_MS = 60000;

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; time: string }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

// The function test of a device, as the WebUI's device dialog: the CCU
// asks the device to answer (Device.startComTest) and waits for it
// (Device.pollComTest).
export const ComTest = ({ address }: { address: string }) => {
  const { request } = useWebSocketActions();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const cancelled = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const run = async () => {
    setState({ kind: 'running' });
    try {
      const { started } = await request({ type: 'startComTest', address }, { queue: false });
      const deadline = Date.now() + GIVE_UP_MS;
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const { answered } = await request({ type: 'pollComTest', address, started });
        if (answered) {
          setState({ kind: 'ok', time: answered.split(' ')[1] ?? answered });
          return;
        }
      }
      if (!cancelled.current) setState({ kind: 'none' });
    } catch (error) {
      setState({ kind: 'error', message: (error as Error).message });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={state.kind === 'running'} onClick={run}>
          <ActivityIcon className={state.kind === 'running' ? 'motion-safe:animate-pulse' : undefined} />
          {state.kind === 'running' ? m.COMTEST_RUNNING() : m.COMTEST_START()}
        </Button>
        <span role="status" className="text-sm">
          {state.kind === 'ok' && (
            <span className="text-emerald-700 dark:text-emerald-400">{m.COMTEST_OK({ time: state.time })}</span>
          )}
          {state.kind === 'none' && <span className="text-amber-700 dark:text-amber-400">{m.COMTEST_NONE()}</span>}
          {state.kind === 'error' && (
            <span className="text-destructive">{m.COMTEST_FAILED({ message: state.message })}</span>
          )}
        </span>
      </div>
      <p className="text-xs">{m.COMTEST_HINT()}</p>
    </div>
  );
};
