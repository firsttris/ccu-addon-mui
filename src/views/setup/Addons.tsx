import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ExternalLinkIcon from '~icons/lucide/external-link';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { WEBUI_URL } from '../../components/WebUILink';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ListSkeletonItems } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { getLocale } from '../../paraglide/runtime';
import { m } from '../../paraglide/messages';
import { Panel } from './Panel';
import { AddonInstall } from './AddonInstall';
import UploadIcon from '~icons/lucide/upload';
import type { Addon } from '../../types/protocol';
import { errorText } from '../../lib/errors';

type Operation = 'restart' | 'uninstall';

// A config URL of the WebUI ("/addons/x/") on the CCU's host
export const addonUrl = (configUrl: string) =>
  /^https?:\/\//.test(configUrl) ? configUrl : `${WEBUI_URL.replace(/\/$/, '')}/${configUrl.replace(/^\//, '')}`;

// The installed add-ons, as the WebUI's Zusatzsoftware dialog
// (cp_software.cgi): version, newest version, settings, restart, uninstall,
// and installing or updating one from a file.
export const Addons = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<{ addon: Addon; operation: Operation } | null>(null);
  const [latest, setLatest] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);
  const { data: addons, isPending } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => (await request({ type: 'getAddons', language: getLocale() === 'en' ? 'en' : 'de' })).addons,
    enabled: userLevel === 'admin',
    retry: false,
  });

  if (userLevel !== 'admin') {
    return null;
  }

  const check = async (addon: Addon) => {
    try {
      const response = await request({ type: 'checkAddonUpdate', id: addon.id });
      setLatest((prev) => ({ ...prev, [addon.id]: response.latest }));
    } catch {
      setLatest((prev) => ({ ...prev, [addon.id]: '?' }));
    }
  };

  const run = async ({ addon, operation }: { addon: Addon; operation: Operation }) => {
    setAsking(null);
    try {
      await request({ type: 'addonAction', id: addon.id, operation }, { queue: false, timeoutMs: 60000 });
      showToast(operation === 'restart' ? m.ADDONS_RESTARTED({ name: addon.name }) : m.ADDONS_UNINSTALLED({ name: addon.name }), 'info');
      if (operation === 'uninstall') {
        await queryClient.invalidateQueries({ queryKey: ['addons'] });
      }
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    }
  };

  return (
    <Panel aria-label={m.ADDONS()}>
      <h2>{m.ADDONS()}</h2>
      <ul aria-label={m.ADDONS()} className="flex flex-col divide-y rounded-lg border">
        {isPending && <ListSkeletonItems rows={2} />}
        {addons?.map((addon) => {
          const newer = latest[addon.id];
          return (
            <li key={addon.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{addon.name}</span>
                {addon.version && <span className="text-sm text-muted-foreground tabular-nums">{addon.version}</span>}
                {newer && newer !== '?' && newer !== addon.version && <Badge variant="secondary">{m.ADDONS_NEWER({ version: newer })}</Badge>}
                {newer && newer === addon.version && <span className="text-xs text-muted-foreground">{m.ADDONS_CURRENT()}</span>}
                {newer === '?' && <span className="text-xs text-muted-foreground">{m.ADDONS_CHECK_FAILED()}</span>}
              </div>
              {addon.info && addon.info.length > 0 && <p className="text-xs">{addon.info.join(' · ')}</p>}
              <div className="flex flex-wrap gap-2">
                {addon.configUrl && (
                  <Button variant="outline" className="h-8" asChild>
                    <a href={addonUrl(addon.configUrl)} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon />
                      {m.ADDONS_SETTINGS()}
                    </a>
                  </Button>
                )}
                {addon.updateUrl && !newer && (
                  <DialogButton type="button" className="h-8" aria-label={`${m.ADDONS_CHECK()} ${addon.name}`} onClick={() => check(addon)}>
                    {m.ADDONS_CHECK()}
                  </DialogButton>
                )}
                {addon.operations.includes('restart') && (
                  <DialogButton
                    type="button"
                    className="h-8"
                    disabled={!elevated}
                    aria-label={`${m.ADDONS_RESTART()} ${addon.name}`}
                    onClick={() => setAsking({ addon, operation: 'restart' })}
                  >
                    {m.ADDONS_RESTART()}
                  </DialogButton>
                )}
                {addon.operations.includes('uninstall') && !addon.self && (
                  <DialogButton
                    type="button"
                    className="h-8"
                    disabled={!elevated}
                    aria-label={`${m.ADDONS_UNINSTALL()} ${addon.name}`}
                    onClick={() => setAsking({ addon, operation: 'uninstall' })}
                  >
                    {m.ADDONS_UNINSTALL()}
                  </DialogButton>
                )}
              </div>
            </li>
          );
        })}
        {!isPending && (addons?.length ?? 0) === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{m.ADDONS_NONE()}</li>
        )}
      </ul>
      <div>
        <Button variant="outline" disabled={!elevated} onClick={() => setInstalling(true)}>
          <UploadIcon />
          {m.ADDON_INSTALL()}
        </Button>
      </div>
      <p className="text-xs">{m.ADDONS_HINT()}</p>
      {installing && <AddonInstall onClose={() => setInstalling(false)} />}
      {asking && (
        <ConfirmDialog
          title={asking.operation === 'restart' ? m.ADDONS_RESTART() : m.ADDONS_UNINSTALL()}
          confirmLabel={asking.operation === 'restart' ? m.ADDONS_RESTART() : m.ADDONS_UNINSTALL()}
          destructive={asking.operation === 'uninstall'}
          onConfirm={() => run(asking)}
          onCancel={() => setAsking(null)}
        >
          {asking.operation === 'restart'
            ? asking.addon.self
              ? m.ADDONS_RESTART_SELF()
              : m.ADDONS_RESTART_CONFIRM({ name: asking.addon.name })
            : m.ADDONS_UNINSTALL_CONFIRM({ name: asking.addon.name })}
        </ConfirmDialog>
      )}
    </Panel>
  );
};
