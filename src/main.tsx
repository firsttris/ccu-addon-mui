// First: the language chosen for the user applies before any text is made
import './i18n/language';
// import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebSocketProvider, shouldRetry } from './hooks/useWebsocket';
import { ThemeProvider } from './contexts/ThemeContext';
import { EffectsProvider } from './contexts/EffectsContext';
import { ToastProvider } from './contexts/ToastContext';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

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

// Keeping the screen on: components/WakeLock, a setting in the menu

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Rooms and trades rarely change; events and reconnects refresh the rest
      staleTime: 5 * 60 * 1000,
      // A wall tablet regains focus all the time
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <ThemeProvider>
    <EffectsProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <WebSocketProvider>
            <RouterProvider router={router} />
          </WebSocketProvider>
        </QueryClientProvider>
      </ToastProvider>
    </EffectsProvider>
  </ThemeProvider>,
);
