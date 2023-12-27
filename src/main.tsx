import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Router } from './router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material';

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

const basename = process.env.NODE_ENV === 'production' ? '/addons/mui/' : '/';

root.render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter basename={basename}>
        <QueryClientProvider client={queryClient}>
          <Router />
        </QueryClientProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
