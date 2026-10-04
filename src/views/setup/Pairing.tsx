import { DeviceImage } from "../../components/DeviceImage";
import { Panel } from "./Panel";
import { ReactNode, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useInbox,
  useInstallMode,
  useInterfaces,
  usePairingAction,
} from "../../queries";
import { useToast } from "../../contexts/ToastContext";
import { DialogButton } from "../../components/ConfirmDialog";
import { m } from "../../paraglide/messages";
import { NativeSelect } from "../../components/ui/select";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { ReplaceDeviceDialog } from "./ReplaceDeviceDialog";
import { Input } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { RequestError } from "../../hooks/useWebsocket";
import type { InboxDevice } from "../../types/protocol";

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);

// BidCos-Wired (RS485 bus) only with a Wired gateway; it has no pairing
// mode, the bus is searched instead (cp_add_device.cgi action_wir_search)
const INTERFACES = ["HmIP-RF", "BidCos-RF", "BidCos-Wired"];
const PAIRING_SECONDS = 60;

// The SGTIN and KEY from an HmIP device's label (cp_add_device.cgi:
// dashes left out; the key in base32 or as 32 hexadecimal digits)
export const SGTIN_PATTERN = /^[0-9A-F]{24}$/;
export const KEY_PATTERN =
  /^([0-9A-F]{32}|[0-9ABCEFGHJKLMNPQRSTUWXYZ]{20,26})$/;
export const cleanLabel = (text: string) =>
  text.replace(/[-\s]/g, "").toUpperCase();

// Pairing an HmIP device without the key server ("Anlernen ohne
// Internetzugang"): only this device, with the key from its label
const LocalPairing = ({
  interfaceName,
  disabled,
  onStart,
}: {
  interfaceName: string;
  disabled: boolean;
  onStart: () => void;
}) => {
  const action = usePairingAction();
  const { showToast } = useToast();
  const [sgtin, setSgtin] = useState("");
  const [key, setKey] = useState("");
  const valid =
    SGTIN_PATTERN.test(cleanLabel(sgtin)) && KEY_PATTERN.test(cleanLabel(key));
  return (
    <details className="rounded-lg border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{m.PAIR_LOCAL()}</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {m.PAIR_LOCAL_HINT()}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">SGTIN</span>
          <Input
            className="w-72 font-mono"
            value={sgtin}
            onChange={(e) => setSgtin(e.target.value)}
            aria-invalid={
              sgtin !== "" && !SGTIN_PATTERN.test(cleanLabel(sgtin))
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">KEY</span>
          <Input
            className="w-72 font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-invalid={key !== "" && !KEY_PATTERN.test(cleanLabel(key))}
          />
        </label>
        <DialogButton
          type="button"
          disabled={disabled || !valid}
          onClick={() =>
            action.mutate(
              {
                type: "setInstallMode",
                interfaceName,
                on: true,
                seconds: PAIRING_SECONDS,
                sgtin,
                key,
              },
              {
                onSuccess: onStart,
                onError: (error) =>
                  showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
              },
            )
          }
        >
          {m.PAIR_LOCAL_START()}
        </DialogButton>
      </div>
    </details>
  );
};

// The system security key a BidCos device was paired with before
// (cp_add_device.cgi put_key_dialog): set as temporary key, then try again
const TempKeyDialog = ({
  serial,
  onRetry,
  onClose,
}: {
  serial: string;
  onRetry: () => void;
  onClose: () => void;
}) => {
  const action = usePairingAction();
  const { showToast } = useToast();
  const [key, setKey] = useState("");
  return (
    <ConfirmDialog
      title={m.PAIR_KEY_TITLE()}
      confirmLabel={m.PAIR_KEY_RETRY()}
      busy={key === "" || action.isPending}
      onCancel={onClose}
      onConfirm={() =>
        action.mutate(
          { type: "setTempKey", interfaceName: "BidCos-RF", key },
          {
            onSuccess: () => {
              onClose();
              onRetry();
            },
            onError: (error) =>
              showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
          },
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p>{m.PAIR_KEY_TEXT({ serial })}</p>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {m.PAIR_KEY_LABEL()}
          </span>
          <Input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
      </div>
    </ConfirmDialog>
  );
};

// Pairing new devices and accepting them from the inbox
export const Pairing = () => {
  usePageTitle(m.SETUP());
  const { showToast } = useToast();
  const [interfaceName, setInterfaceName] = useState(INTERFACES[0]);
  const [started, setStarted] = useState(false);
  const { data: connected = [] } = useInterfaces();
  const interfaces = INTERFACES.filter(
    (name) => name !== "BidCos-Wired" || connected.includes(name),
  );
  const wired = interfaceName === "BidCos-Wired";
  const { data: { seconds, keyMismatch } = { seconds: 0 }, dataUpdatedAt } =
    useInstallMode(interfaceName, { poll: started, enabled: !wired });
  const active = seconds > 0;
  const { data: inbox = [] } = useInbox({ poll: started && active });
  const action = usePairingAction();
  const [replacing, setReplacing] = useState<InboxDevice | null>(null);
  const [serial, setSerial] = useState("");
  // A device with another security key: by serial number or in install mode
  const [mismatch, setMismatch] = useState<{
    serial: string;
    bySerial: boolean;
  } | null>(null);
  // The CCU reports such a device once (getKeyMismatchDevice resets it).
  // A failed addDevice reports it there too: then it stays a retry by
  // serial number instead of turning into install mode.
  useEffect(() => {
    if (keyMismatch)
      setMismatch((prev) =>
        prev?.serial === keyMismatch.toUpperCase()
          ? prev
          : { serial: keyMismatch, bySerial: false },
      );
  }, [keyMismatch, dataUpdatedAt]);

  const startPairing = () => {
    setStarted(true);
    run({
      type: "setInstallMode",
      interfaceName,
      on: true,
      seconds: PAIRING_SECONDS,
    });
  };
  const addBySerial = (address: string) =>
    action.mutate(
      { type: "addDeviceBySerial", interfaceName: "BidCos-RF", address },
      {
        onSuccess: () => {
          showToast(
            m.PAIR_SERIAL_DONE({ serial: address.toUpperCase() }),
            "info",
          );
          setSerial("");
        },
        onError: (error) => {
          if (error instanceof RequestError && error.code === "KEY_MISMATCH")
            setMismatch({ serial: address.toUpperCase(), bySerial: true });
          else
            showToast(
              `${m.PAIR_SERIAL_FAILED({ serial: address })}: ${error.message}`,
            );
        },
      },
    );

  const run = (
    variables: Parameters<typeof action.mutate>[0],
    success?: string,
  ) =>
    action.mutate(variables, {
      onSuccess: () => success && showToast(success, "info"),
      onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    });

  return (
    <Panel aria-label={m.PAIRING()}>
      <h2>{m.PAIRING()}</h2>
      <p>{m.PAIRING_HINT()}</p>
      <Row>
        <NativeSelect
          className="w-40"
          aria-label={m.INTERFACE()}
          value={interfaceName}
          onChange={(e) => setInterfaceName(e.target.value)}
        >
          {interfaces.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </NativeSelect>
        {wired ? (
          <DialogButton
            type="button"
            primary
            disabled={action.isPending}
            onClick={() =>
              run({ type: "searchWiredDevices" }, m.WIRED_SEARCH_DONE())
            }
          >
            {m.WIRED_SEARCH()}
          </DialogButton>
        ) : active ? (
          <>
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-sm font-medium text-sky-800 dark:text-sky-300"
            >
              <span className="size-2 animate-pulse rounded-full bg-sky-500" />
              {m.PAIRING_ACTIVE()}: {seconds} s
            </span>
            <DialogButton
              type="button"
              onClick={() =>
                run({
                  type: "setInstallMode",
                  interfaceName,
                  on: false,
                  seconds: 0,
                })
              }
            >
              {m.STOP_PAIRING()}
            </DialogButton>
          </>
        ) : (
          <DialogButton type="button" primary onClick={startPairing}>
            {m.START_PAIRING()}
          </DialogButton>
        )}
      </Row>
      {interfaceName === "HmIP-RF" && (
        <LocalPairing
          interfaceName={interfaceName}
          disabled={action.isPending}
          onStart={() => setStarted(true)}
        />
      )}
      {interfaceName === "BidCos-RF" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {m.PAIR_SERIAL()}
            </span>
            <Input
              className="w-48 font-mono"
              value={serial}
              onChange={(e) => setSerial(e.target.value.trim())}
            />
          </label>
          <DialogButton
            type="button"
            disabled={!/^[A-Za-z0-9]{10}$/.test(serial) || action.isPending}
            onClick={() => addBySerial(serial)}
          >
            {m.PAIR_SERIAL_START()}
          </DialogButton>
        </div>
      )}
      {mismatch && (
        <TempKeyDialog
          serial={mismatch.serial}
          onClose={() => setMismatch(null)}
          onRetry={() =>
            mismatch.bySerial ? addBySerial(mismatch.serial) : startPairing()
          }
        />
      )}

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
              <span className="flex min-w-0 items-center gap-3">
                <DeviceImage type={device.type} size={64} />
                <span>
                  <Link
                    to="/device/$interfaceName/$address"
                    params={{
                      interfaceName: device.interfaceName,
                      address: device.address,
                    }}
                  >
                    {device.name}
                  </Link>{" "}
                  ({device.type})
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                {device.interfaceName !== "HmIP-RF" && (
                  <DialogButton
                    type="button"
                    aria-label={`${m.REPLACE_BUTTON()} ${device.name}`}
                    onClick={() => setReplacing(device)}
                  >
                    {m.REPLACE_BUTTON()}
                  </DialogButton>
                )}
                <DialogButton
                  type="button"
                  onClick={() =>
                    run(
                      { type: "acceptDevice", address: device.address },
                      m.ACCEPTED(),
                    )
                  }
                >
                  {m.ACCEPT()}
                </DialogButton>
              </span>
            </li>
          ))}
        </ul>
      )}
      {replacing && (
        <ReplaceDeviceDialog
          device={replacing}
          onDone={() => setReplacing(null)}
        />
      )}
    </Panel>
  );
};
