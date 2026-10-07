import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { lookForNewApp } from '../lib/appUpdate';
import { Button } from './ui/button';
import { m } from '../paraglide/messages';

// A wall tablet keeps the app open for weeks: look for a new version every hour
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// A new version of the app is installed in the background and taken over
// without losing what is being edited: at the next change of page, which
// drops unsaved changes anyway, or when the user says so. Reloading at any
// moment would drop a program or layout being edited. Until then the old
// version keeps running.
export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => registration.update().catch(() => undefined), UPDATE_CHECK_MS);
    },
  });

  // The server restarts after an update of the add-on (installSelfUpdate,
  // the WebUI's Zusatzsoftware): look for the new app as soon as it is back,
  // on every device that has the app open
  const { connectionStatus } = useWebSocketContext();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (connectionStatus !== 'Open') return;
    if (wasOpen.current) void lookForNewApp();
    wasOpen.current = true;
  }, [connectionStatus]);

  // The new version takes over at the next change of page; the reload
  // (registerSW, on 'controlling') lands on the page navigated to
  const router = useRouter();
  useEffect(() => {
    if (!needRefresh) return;
    return router.subscribe('onResolved', (event) => {
      if (event.pathChanged) void updateServiceWorker(true);
    });
  }, [needRefresh, router, updateServiceWorker]);

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg"
    >
      <span className="flex-1">{m.APP_UPDATE_AVAILABLE()}</span>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        {m.UPDATE_RELOAD()}
      </Button>
    </div>
  );
};
