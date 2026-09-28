// import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { WebSocketProvider } from './hooks/useWebsocket';
import { ThemeProvider } from './contexts/ThemeContext';
import '@fontsource/roboto';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

// Create a new router instance
const router = createRouter({
  routeTree,
  basepath: process.env.NODE_ENV === 'production' ? '/addons/mui' : undefined,
});

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const requestWakeLock = async () => {
  try {
    const wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      console.log('Wake Lock wurde freigegeben.');
    });
  } catch (err) {
    console.error('Wake Lock konnte nicht angefordert werden:', err);
  }
};

// The Wake Lock API only exists in a secure context (HTTPS or localhost).
if ('wakeLock' in navigator) {
  requestWakeLock();
  // The browser releases the lock whenever the page is hidden (tab switch,
  // screen off), so request it again when it becomes visible.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
    }
  });
} else {
  console.info('Wake Lock nicht verfügbar (nur über HTTPS).');
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <ThemeProvider>
    <WebSocketProvider>
      <RouterProvider router={router} />
    </WebSocketProvider>
  </ThemeProvider>,
);
