import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import TrashIcon from '~icons/lucide/trash-2';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { DeviceImage } from '../../../components/DeviceImage';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { useHasWebUI, WebUILink } from '../../../components/WebUILink';
import { useToast } from '../../../contexts/ToastContext';
import { errorText } from '../../../lib/errors';
import { cn } from '../../../lib/utils';
import { m } from '../../../paraglide/messages';
import { usePairingAction } from '../../../queries';
import type { Device } from '../../../types/types';
import type { DeviceTab } from '../deviceTabs';

// Deleting the device, optionally with a reset to factory settings or
// forced when it doesn't answer
const DeleteDeviceDialog = ({
  interfaceName,
  address,
  onDone,
}: {
  interfaceName: string;
  address: string;
  onDone: () => void;
}) => {
  const pairingAction = usePairingAction();
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Each time without reset or force, also after a cancel
  const [options, setOptions] = useState({ reset: false, force: false });
  return (
    <ConfirmDialog
      title={m.DELETE_DEVICE()}
      confirmLabel={m.DELETE()}
      busy={pairingAction.isPending}
      destructive
      onCancel={onDone}
      onConfirm={() =>
        pairingAction.mutate(
          { type: 'deleteDevice', interfaceName, address, ...options },
          {
            onSuccess: () => {
              showToast(m.DELETED(), 'info');
              navigate({ to: '/setup' });
            },
            onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
            onSettled: onDone,
          },
        )
      }
    >
      <p>{m.DELETE_DEVICE_CONFIRM()}</p>
      {(['reset', 'force'] as const).map((option) => (
        <label key={option} className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={options[option]}
            onChange={(event) => setOptions((prev) => ({ ...prev, [option]: event.target.checked }))}
          />
          {option === 'reset' ? m.DELETE_RESET() : m.DELETE_FORCE()}
        </label>
      ))}
    </ConfirmDialog>
  );
};

// Back to the device list, the device's picture, name and facts, deleting
// it, and the tabs of its page
export const DeviceHeader = ({
  interfaceName,
  address,
  device,
  title,
  canEdit,
  activeChannel,
  tabs,
  tab,
  onTab,
}: {
  interfaceName: string;
  address: string;
  device?: Device;
  title: string;
  canEdit: boolean;
  activeChannel?: string;
  tabs: { id: DeviceTab; label: string }[];
  tab: DeviceTab;
  onTab: (tab: DeviceTab) => void;
}) => {
  const hasWebUI = useHasWebUI();
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Link
        to="/setup"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        {m.DEVICES()}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <DeviceImage
            type={device?.type}
            size={96}
            channel={activeChannel}
            className={cn('max-sm:hidden', tab === 'channels' && 'xl:hidden')}
          />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {device?.type && <Badge variant="outline">{device.type}</Badge>}
              <span className="font-mono text-[13px]">{address}</span>
              <span>· {interfaceName}</span>
              {device?.firmware && (
                <span>
                  · {m.FIRMWARE()} {device.firmware}
                </span>
              )}
              {hasWebUI && (
                <>
                  <span>·</span>
                  <WebUILink />
                </>
              )}
            </div>
          </div>
        </div>
        {canEdit && device && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            <TrashIcon />
            {m.DELETE_DEVICE()}
          </Button>
        )}
      </div>
      <div
        role="tablist"
        aria-label={m.DEVICE_TABS()}
        className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              'h-10 shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {deleting && (
        <DeleteDeviceDialog interfaceName={interfaceName} address={address} onDone={() => setDeleting(false)} />
      )}
    </div>
  );
};
