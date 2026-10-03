import { Panel } from './Panel';
import { ReactNode, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInbox, useInstallMode, usePairingAction } from '../../queries';
import { useToast } from '../../contexts/ToastContext';
import { DialogButton } from '../../components/ConfirmDialog';
import { m } from '../../paraglide/messages';
import { NativeSelect } from '../../components/ui/select';
import { usePageTitle } from '../../contexts/PageTitleContext';

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);

const INTERFACES = ['HmIP-RF', 'BidCos-RF'];
const PAIRING_SECONDS = 60;

// Pairing new devices and accepting them from the inbox
export const Pairing = () => {
  usePageTitle(m.SETUP());
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
        <NativeSelect className="w-40" aria-label={m.INTERFACE()} value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)}>
          {INTERFACES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </NativeSelect>
        {active ? (
          <>
            <span role="status" className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-sm font-medium text-sky-800 dark:text-sky-300">
              <span className="size-2 animate-pulse rounded-full bg-sky-500" />
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

      <h2 className="mt-3">{m.INBOX()}</h2>
      {inbox.length === 0 ? (
        <p>{m.INBOX_EMPTY()}</p>
      ) : (
        <ul
          aria-label={m.INBOX()}
          className="flex flex-col divide-y rounded-lg border [&_a]:font-medium [&_a]:hover:underline [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-2 [&_li]:px-3 [&_li]:py-2 [&_li]:text-sm"
        >
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
        </ul>
      )}
    </Panel>
  );
};
