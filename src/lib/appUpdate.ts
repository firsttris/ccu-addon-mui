// The app runs from the service worker's cache. After an update of the
// add-on (installSelfUpdate, or the WebUI's Zusatzsoftware) the old version
// keeps running until the service worker finds the new one: by itself only
// at the next navigation or within the hour (UpdatePrompt).

const registration = () =>
  navigator.serviceWorker?.getRegistration().catch(() => undefined) ?? Promise.resolve(undefined);

// Looks for a new version now; UpdatePrompt takes it over once it is
// installed
export const lookForNewApp = () =>
  registration()
    .then((r) => r?.update())
    .catch(() => undefined);

// Switches to the version installed on the server and reloads: the new
// service worker takes over (SKIP_WAITING, which the generated worker of
// registerType 'prompt' listens for) and the page loads from it. Without a
// service worker (dev, http without localhost) a reload is all it takes.
export const reloadToNewApp = async () => {
  const r = await registration();
  await r?.update().catch(() => undefined);
  const worker = r?.waiting ?? r?.installing;
  if (!worker) {
    location.reload();
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  // Installing the new files hangs (lost connection): reload anyway, the
  // service worker then tries again in the background
  setTimeout(() => location.reload(), 60 * 1000);
  const takeOver = () => {
    if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    // The download of the new files failed: the reload tries again
    else if (worker.state === 'redundant') location.reload();
  };
  worker.addEventListener('statechange', takeOver);
  takeOver();
};
