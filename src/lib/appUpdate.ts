// The app runs from the service worker's cache. After an update of the
// add-on (installSelfUpdate, or the WebUI's Zusatzsoftware) the old version
// keeps running until the service worker finds the new one, by itself only
// at the next start or within the hour. This looks for it now; UpdatePrompt
// offers to reload once it is installed.
export const lookForNewApp = () =>
  navigator.serviceWorker
    ?.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);
