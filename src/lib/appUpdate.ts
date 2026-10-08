// The service worker of the app. Asked by the page's own address:
// getRegistration() without one resolves against the document's base URL,
// <base href="/"> in index.html, which lies outside the worker's scope
// /addons/mui/ on the CCU, and finds nothing (so lookForNewApp never found
// a new version there)
const swRegistration = async () => navigator.serviceWorker?.getRegistration(window.location.href);

// The app runs from the service worker's cache. After an update of the
// add-on (installSelfUpdate, or the WebUI's Zusatzsoftware) the old version
// keeps running until the service worker finds the new one, by itself only
// at the next start or within the hour. This looks for it now; UpdatePrompt
// offers to reload once it is installed.
export const lookForNewApp = () =>
  swRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);

// --- Other tabs of the app in this browser

// Taking over a new service worker reloads every tab of the app in this
// browser (registerSW reloads on 'controlling'), also one in the middle of
// editing a program (the reason reloadToNewApp went again in #196). The
// update wizard takes over by itself only when no other tab answers.
const TABS_CHANNEL = 'mui-tabs';
// A channel hears the other channels of its own tab too: questions and
// answers carry the tab, so a tab doesn't count itself
const TAB = Math.random().toString(36).slice(2);

// Every tab answers the others' question (started once, in UpdatePrompt)
export const answerTabQuestions = () => {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(TABS_CHANNEL);
  channel.onmessage = (event) => {
    if (event.data?.ping && event.data.ping !== TAB) channel.postMessage({ pong: TAB });
  };
  return () => channel.close();
};

// Whether the app is open in another tab of this browser
export const otherAppTabs = (waitMs = 300): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof BroadcastChannel === 'undefined') {
      resolve(false);
      return;
    }
    const channel = new BroadcastChannel(TABS_CHANNEL);
    const done = (found: boolean) => {
      clearTimeout(timer);
      channel.close();
      resolve(found);
    };
    const timer = setTimeout(() => done(false), waitMs);
    channel.onmessage = (event) => {
      if (event.data?.pong && event.data.pong !== TAB) done(true);
    };
    channel.postMessage({ ping: TAB });
  });

// --- Taking over the new app after an update of the add-on

// The version the update wizard installed: after the reload the app checks
// that it runs it (UpdateDone)
export const UPDATED_TO_KEY = 'mui-updated-to';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The newest service worker, once it is installed: waits for one still
// installing, so it never takes an older one that waited from before
const installedWorker = (registration: ServiceWorkerRegistration, timeoutMs: number) =>
  new Promise<ServiceWorker | null>((resolve) => {
    const timer = setTimeout(() => resolve(registration.waiting), timeoutMs);
    const settle = () => {
      const installing = registration.installing;
      if (!installing) {
        clearTimeout(timer);
        resolve(registration.waiting);
        return;
      }
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' || installing.state === 'redundant') settle();
      });
    };
    settle();
  });

export type TakeOver = 'reloading' | 'otherTabs' | 'failed';

// Brings this tab to the new app the server now serves (called only once
// the server is back with the new version): looks for the new service
// worker, a few times while the web server may still be restarting, waits
// until it has the whole app cached, and takes it over, which reloads. Not
// while another tab of the app is open; and never blindly into the old app
// when the new one can't be loaded.
export const takeOverNewApp = async (version: string): Promise<TakeOver> => {
  sessionStorage.setItem(UPDATED_TO_KEY, version);
  const registration = await swRegistration().catch(() => undefined);
  if (!registration) {
    // No service worker (development, plain http): the page comes fresh
    window.location.reload();
    return 'reloading';
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await registration.update();
      break;
    } catch {
      if (attempt === 3) return 'failed';
      await wait(2000 * (attempt + 1));
    }
  }
  const worker = await installedWorker(registration, 60_000);
  if (!worker) {
    // Nothing new to take over: the cache may already hold the new app
    window.location.reload();
    return 'reloading';
  }
  if (await otherAppTabs()) return 'otherTabs';
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  worker.postMessage({ type: 'SKIP_WAITING' });
  return 'reloading';
};

// "Jetzt neu laden" after the other tabs were saved: takes the waiting app over
export const takeOverNow = async () => {
  const registration = await swRegistration().catch(() => undefined);
  const worker = registration?.waiting;
  if (!worker) {
    window.location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  worker.postMessage({ type: 'SKIP_WAITING' });
};
