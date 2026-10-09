import { usePlatform } from '../hooks/useWebsocket';
import { m } from '../paraglide/messages';

// The add-on runs on the CCU itself, so the WebUI is at the root of the same
// host. For development against a remote CCU, set VITE_WEBUI_URL.
export const WEBUI_URL = import.meta.env.VITE_WEBUI_URL || '/';

// Whether there is a WebUI to link to: openccu-lite has none, "/" is its
// own status page there
export const useHasWebUI = () => usePlatform() !== 'lite';

// Fallback for everything the app can't do yet (settings, links, programs).
// The WebUI has no deep links without a session, so it opens its start page.
export const WebUILink = () => {
  if (!useHasWebUI()) return null;
  return (
    <a className="text-[12px] text-muted-foreground whitespace-nowrap" href={WEBUI_URL} target="_blank" rel="noopener noreferrer">
      {m.OPEN_IN_WEBUI()} ↗
    </a>
  );
};
