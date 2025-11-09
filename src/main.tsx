// import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Router } from './router';
import { css, Global } from '@emotion/react';
import { WebSocketProvider } from './hooks/useWebsocket';
import '@fontsource/roboto';

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

requestWakeLock();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <>
    <Global
      styles={css`
        body {
          user-select: none;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: 'Roboto';
        }
      `}
    />
    <WebSocketProvider>
      <Router />
    </WebSocketProvider>
  </>,
);
