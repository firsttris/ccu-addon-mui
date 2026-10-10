import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import UploadIcon from '~icons/lucide/upload';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { usePasswordRetry } from './usePasswordRetry';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';
import { formatDate } from '../../lib/format';

// Websocket messages are limited to 128 KiB; certificate chains are far
// smaller
const MAX_CERTIFICATE_BYTES = 100_000;

// A PEM file as the WebUI takes it (cp_network.cgi action_cert_upload):
// a certificate and its private key
export const looksLikeCertificate = (text: string) =>
  /^-----BEGIN CERTIFICATE-----$/m.test(text) && /^-----BEGIN (RSA )?PRIVATE KEY-----$/m.test(text);

const DAY = 24 * 60 * 60 * 1000;

// The HTTPS certificate of the WebUI (Systemsteuerung → Netzwerk →
// Zertifikat): the own one in use, replacing it with a PEM file of
// certificate and key, or going back to the one the CCU generates. The web
// server restarts afterwards.
export const Certificate = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['certificate'],
    queryFn: async () => (await request({ type: 'getCertificate' })).certificate,
    enabled: userLevel === 'admin',
    retry: false,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; pem: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();

  if (userLevel !== 'admin' || isError) return null;
  if (!data) {
    return (
      <Panel aria-label={m.CERT_TITLE()} aria-busy>
        <h2>{m.CERT_TITLE()}</h2>
        <PanelSkeleton lines={3} />
      </Panel>
    );
  }

  const disabled = !elevated || busy;
  const notAfter = data.notAfter ? new Date(data.notAfter) : undefined;
  const expired = notAfter !== undefined && notAfter.getTime() < Date.now();
  const expiresSoon = notAfter !== undefined && !expired && notAfter.getTime() - Date.now() < 30 * DAY;

  const pick = async (picked: File | undefined) => {
    setFile(null);
    setFileError('');
    if (!picked) return;
    if (picked.size > MAX_CERTIFICATE_BYTES) {
      setFileError(m.CERT_TOO_LARGE());
      return;
    }
    const pem = await picked.text();
    if (!looksLikeCertificate(pem)) {
      setFileError(m.CERT_INVALID());
      return;
    }
    setFile({ name: picked.name, pem });
  };

  const run = (type: 'uploadCertificate' | 'deleteCertificate') =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            type === 'uploadCertificate'
              ? // biome-ignore lint/style/noNonNullAssertion: uploading is disabled until a file is picked
                { type, pem: file!.pem, ...(pw !== undefined ? { password: pw } : {}) }
              : { type, ...(pw !== undefined ? { password: pw } : {}) },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(type === 'uploadCertificate' ? m.CERT_UPLOADED() : m.CERT_DELETED(), 'info');
          setFile(null);
          setDeleting(false);
          if (fileInput.current) fileInput.current.value = '';
          await queryClient.invalidateQueries({ queryKey: ['certificate'] });
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        showToast(errorText(error, m.CHANGE_FAILED));
        setDeleting(false);
      },
    );

  return (
    <Panel aria-label={m.CERT_TITLE()}>
      <h2>{m.CERT_TITLE()}</h2>
      {data.exists ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{m.CERT_SUBJECT()}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{data.subject ?? '–'}</span>
            {data.selfSigned && <Badge variant="secondary">{m.CERT_SELF_SIGNED()}</Badge>}
          </dd>
          {data.issuer && !data.selfSigned && (
            <>
              <dt className="text-muted-foreground">{m.CERT_ISSUER()}</dt>
              <dd>{data.issuer}</dd>
            </>
          )}
          {data.dnsNames && data.dnsNames.length > 0 && (
            <>
              <dt className="text-muted-foreground">{m.CERT_NAMES()}</dt>
              <dd className="font-mono text-[13px]">{data.dnsNames.join(', ')}</dd>
            </>
          )}
          {notAfter && (
            <>
              <dt className="text-muted-foreground">{m.CERT_VALID_UNTIL()}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {formatDate(notAfter, { dateStyle: 'medium' })}
                {expired && <Badge variant="destructive">{m.CERT_EXPIRED()}</Badge>}
                {expiresSoon && <Badge variant="warning">{m.CERT_EXPIRES_SOON()}</Badge>}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-sm">{m.CERT_GENERATED()}</p>
      )}
      <p className="text-xs text-muted-foreground">{m.CERT_HINT()}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".pem,.crt,.cer,.key,application/x-pem-file"
          aria-label={m.CERT_FILE()}
          className="max-w-full text-sm file:mr-3 file:h-9 file:rounded-md file:border file:bg-background file:px-3 file:text-sm file:font-medium"
          disabled={disabled}
          onChange={(event) => pick(event.target.files?.[0])}
        />
        <Button type="button" disabled={disabled || !file || password.blocked} onClick={() => run('uploadCertificate')}>
          <UploadIcon />
          {m.CERT_UPLOAD()}
        </Button>
        {data.exists && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={disabled}
            onClick={() => setDeleting(true)}
          >
            {m.CERT_DELETE()}
          </Button>
        )}
      </div>
      {fileError && (
        <p role="alert" className="text-xs text-destructive">
          {fileError}
        </p>
      )}
      {file && <p className="text-xs text-amber-700 dark:text-amber-400">{m.CERT_RESTART_HINT()}</p>}
      {!deleting && password.field}
      {deleting && (
        <ConfirmDialog
          title={m.CERT_DELETE()}
          confirmLabel={m.CERT_DELETE()}
          destructive
          busy={busy || password.blocked}
          onConfirm={() => run('deleteCertificate')}
          onCancel={() => setDeleting(false)}
        >
          <div className="flex flex-col gap-3">
            <p>{m.CERT_DELETE_QUESTION()}</p>
            {password.field}
          </div>
        </ConfirmDialog>
      )}
    </Panel>
  );
};
