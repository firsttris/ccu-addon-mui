import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import DownloadIcon from '~icons/lucide/circle-arrow-down';
import UploadIcon from '~icons/lucide/upload';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useUpload } from '../../hooks/useUpload';
import {
  DEVICE_FIRMWARE_TIMEOUT_MS,
  useDeviceFirmwareCatalog,
  useDeviceFirmwareChanged,
  useDeviceFirmwareFiles,
  useDevices,
} from '../../queries';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { m } from '../../paraglide/messages';
import { Panel } from './Panel';
import { usePasswordRetry } from './usePasswordRetry';
import { typeUpdates } from './deviceFirmwareUpdates';
import { Firmware, updateAction } from './Firmware';
import { useChannelNames } from './channelNames';
import type { DeviceFirmwareFile } from '../../types/protocol';
import { errorText } from '../../lib/errors';

export const deviceFirmwareError = (error: Error) =>
  errorText(error, m.CHANGE_FAILED, {
    INVALID_FIRMWARE: m.DEVFW_INVALID,
    FIRMWARE_NEEDS_NEWER_CCU: m.DEVFW_NEEDS_NEWER_CCU,
    UPDATE_SERVER_ERROR: m.DEVFW_CHECK_FAILED,
  });

// Loads the newest firmware for a device type from eQ-3 onto the CCU; the
// password once if the server needs a WebUI session for the HMServer
export const useDownloadDeviceFirmware = () => {
  const { request } = useWebSocketActions();
  const changed = useDeviceFirmwareChanged();
  const retry = usePasswordRetry();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const download = (type: string, version: string) => {
    setBusy(type);
    return retry
      .run(
        async (password) => {
          await request(
            { type: 'downloadDeviceFirmware', deviceType: type, password },
            { queue: false, timeoutMs: DEVICE_FIRMWARE_TIMEOUT_MS },
          );
          await changed();
          showToast(m.DEVFW_DOWNLOADED({ version, type }), 'info');
        },
        (error) => showToast(deviceFirmwareError(error)),
      )
      .finally(() => setBusy(null));
  };
  return { download, busy, passwordField: retry.field, blocked: retry.blocked };
};

// Device firmware: what eQ-3 has newer than the devices, loaded onto the
// CCU with one click, and the firmware files on the CCU (the WebUI's
// device firmware page, AvailableFirmware.ftl: add, remove, changelog).
export const DeviceFirmware = () => {
  const { userLevel, elevated } = useWebSocketContext();
  const admin = userLevel === 'admin';
  const { data: files, isPending } = useDeviceFirmwareFiles(admin);
  const { data: devices } = useDevices();
  const catalog = useDeviceFirmwareCatalog(admin);
  const { download, busy, passwordField, blocked } = useDownloadDeviceFirmware();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<DeviceFirmwareFile | null>(null);
  const [changelog, setChangelog] = useState<DeviceFirmwareFile | null>(null);
  const names = useChannelNames();

  if (!admin) {
    return null;
  }
  const updates = typeUpdates(devices, catalog.data);
  // Devices the CCU has an update ready for, from their own descriptions
  // and without eQ-3 (ic_deviceFirmwareOverview.cgi lists every device
  // with its state and update button)
  const ready = (devices ?? []).filter((d) => updateAction(d) !== undefined);

  return (
    <Panel aria-label={m.DEVFW_TITLE()}>
      <h2>{m.DEVFW_TITLE()}</h2>
      <p>{m.DEVFW_INTRO()}</p>

      {ready.length > 0 && (
        <>
          <h3 className="text-sm font-medium">{m.DEVFW_READY()}</h3>
          <ul aria-label={m.DEVFW_READY()} className="flex flex-col divide-y rounded-lg border">
            {ready.map((device) => (
              <li key={device.address} className="flex flex-col gap-2 px-3 py-2.5 text-sm">
                <span className="font-medium">
                  {names.get(device.address) ?? device.name ?? device.address}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {device.type} · {device.address}
                  </span>
                </span>
                <Firmware device={device} canEdit={elevated} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="text-sm font-medium">{m.DEVFW_UPDATES()}</h3>
      {catalog.isPending && (
        <ul className="flex flex-col divide-y rounded-lg border" aria-busy>
          <ListSkeletonItems rows={1} />
        </ul>
      )}
      {catalog.isError && <p role="status">{m.DEVFW_CHECK_FAILED()}</p>}
      {catalog.data && updates.length === 0 && <p role="status">{m.DEVFW_NO_UPDATES()}</p>}
      {updates.length > 0 && (
        <ul aria-label={m.DEVFW_UPDATES()} className="flex flex-col divide-y rounded-lg border">
          {updates.map((u) => (
            <li key={u.type} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
              <span className="min-w-[160px] font-medium">{u.type}</span>
              <span className="text-muted-foreground tabular-nums">
                {m.DEVFW_DEVICES({ count: u.devices.length, installed: u.installed.join(', ') })}
              </span>
              <Badge variant="secondary">{u.version}</Badge>
              <span className="ml-auto">
                {u.onCcu ? (
                  <span className="text-xs text-muted-foreground">{m.DEVFW_ON_CCU()}</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7"
                    aria-label={`${m.DEVFW_DOWNLOAD()} ${u.type}`}
                    disabled={!elevated || busy !== null || blocked}
                    onClick={() => download(u.type, u.version)}
                  >
                    <DownloadIcon />
                    {m.DEVFW_DOWNLOAD()}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {passwordField}

      <h3 className="mt-2 text-sm font-medium">{m.DEVFW_FILES()}</h3>
      <ul aria-label={m.DEVFW_FILES()} className="flex flex-col divide-y rounded-lg border">
        {isPending && <ListSkeletonItems rows={1} />}
        {files?.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">{m.DEVFW_NO_FILES()}</li>}
        {files?.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
            <span className="min-w-[160px] font-medium">{file.name}</span>
            <span className="tabular-nums">{file.version}</span>
            {file.minCcuVersion && (
              <span className="text-xs text-muted-foreground">{m.DEVFW_MIN_CCU({ version: file.minCcuVersion })}</span>
            )}
            <span className="ml-auto flex gap-2">
              {file.changelog && (
                <DialogButton type="button" className="h-7" onClick={() => setChangelog(file)}>
                  {m.DEVFW_CHANGELOG()}
                </DialogButton>
              )}
              <DialogButton
                type="button"
                className="h-7"
                disabled={!elevated}
                aria-label={`${m.DEVFW_DELETE()} ${file.name}`}
                onClick={() => setDeleting(file)}
              >
                {m.DEVFW_DELETE()}
              </DialogButton>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" className="h-7" disabled={!elevated} onClick={() => setUploading(true)}>
          <UploadIcon />
          {m.DEVFW_UPLOAD()}
        </Button>
        <span className="text-xs text-muted-foreground">{m.DEVFW_UPLOAD_HINT()}</span>
      </div>

      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
      {deleting && <DeleteDialog file={deleting} onClose={() => setDeleting(null)} />}
      {changelog && <ChangelogDialog file={changelog} onClose={() => setChangelog(null)} />}
    </Panel>
  );
};

const UploadDialog = ({ onClose }: { onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const upload = useUpload();
  const changed = useDeviceFirmwareChanged();
  const retry = usePasswordRetry();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  // Kept for the retry with the password
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    await retry.run(
      async (password) => {
        let id = uploadId;
        if (!id) {
          const prepared = await request({ type: 'prepareDeviceFirmwareUpload' }, { queue: false });
          await upload(prepared.url, file);
          id = prepared.id;
          setUploadId(id);
        }
        try {
          await request(
            { type: 'addDeviceFirmware', id, fileName: file.name, password },
            { queue: false, timeoutMs: DEVICE_FIRMWARE_TIMEOUT_MS },
          );
        } catch (e) {
          // The server keeps the file only while it waits for the password
          if (!(e instanceof RequestError && e.code === 'PASSWORD_REQUIRED')) setUploadId(null);
          throw e;
        }
        await changed();
        showToast(m.DEVFW_ADDED(), 'info');
        onClose();
      },
      (e) => setError(deviceFirmwareError(e)),
    );
    setBusy(false);
  };

  return (
    <ConfirmDialog
      title={m.DEVFW_UPLOAD()}
      confirmLabel={m.DEVFW_UPLOAD()}
      busy={busy || !file || retry.blocked}
      onConfirm={add}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-3">
        <p>{m.DEVFW_UPLOAD_HINT()}</p>
        <input
          type="file"
          accept=".tgz,.tar.gz,application/gzip"
          aria-label={m.DEVFW_UPLOAD()}
          className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUploadId(null);
          }}
        />
        {retry.field}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
};

const DeleteDialog = ({ file, onClose }: { file: DeviceFirmwareFile; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const changed = useDeviceFirmwareChanged();
  const retry = usePasswordRetry();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    await retry.run(
      async (password) => {
        await request({ type: 'deleteDeviceFirmware', id: file.id, password }, { queue: false });
        await changed();
        showToast(m.DEVFW_DELETED({ name: file.name }), 'info');
        onClose();
      },
      (e) => showToast(deviceFirmwareError(e)),
    );
    setBusy(false);
  };

  return (
    <ConfirmDialog
      title={m.DEVFW_DELETE()}
      confirmLabel={m.DEVFW_DELETE()}
      destructive
      busy={busy || retry.blocked}
      onConfirm={remove}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-3">
        <p>{m.DEVFW_DELETE_CONFIRM({ name: file.name, version: file.version })}</p>
        {retry.field}
      </div>
    </ConfirmDialog>
  );
};

const ChangelogDialog = ({ file, onClose }: { file: DeviceFirmwareFile; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const { data, isError } = useQuery({
    queryKey: ['deviceFirmwareChangelog', file.id],
    queryFn: async () => (await request({ type: 'getDeviceFirmwareChangelog', id: file.id })).changelog,
    retry: false,
  });
  return (
    <ConfirmDialog
      title={`${m.DEVFW_CHANGELOG()}: ${file.name} ${file.version}`}
      confirmLabel={m.STATUS_OK()}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <section
        aria-label={m.DEVFW_CHANGELOG()}
        className="font-mono max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-foreground"
      >
        {isError ? m.CHANGE_FAILED() : (data ?? '…')}
      </section>
    </ConfirmDialog>
  );
};
