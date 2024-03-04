import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Router } from './router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material';

const requestWakeLock = async () => {
  try {
    const wakeLock = await navigator.wakeLock.request("screen");

    wakeLock.addEventListener("release", () => {
      console.log("Wake Lock wurde freigegeben.");
    });
  } catch (err) {
    console.error("Wake Lock konnte nicht angefordert werden:", err);
  }
};


requestWakeLock();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const theme = createTheme();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <StrictMode>
    <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <Router />
        </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);
