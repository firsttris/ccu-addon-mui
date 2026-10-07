import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { lookForNewApp } from '../lib/appUpdate';
import { Button } from './ui/button';
import { m } from '../paraglide/messages';

// A wall tablet keeps the app open for weeks: look for a new version every hour
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// A new version of the app is installed in the background and only taken
// over when the user says so: reloading on its own would drop what is being
// edited (a program, the layout), in every open tab. Until then the old
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
