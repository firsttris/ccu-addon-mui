import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Header } from '../components/Header';
import { PageTitleProvider } from '../contexts/PageTitleContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Login } from '../views/Login';
import { SessionExpired } from '../views/setup/LiteHints';
import { UpdatePrompt } from '../components/UpdatePrompt';

const RootComponent = () => {
  const { authState } = useWebSocketContext();

  return (
    <>
      {authState === 'loginRequired' ? (
        <Login />
      ) : authState === 'sessionRequired' ? (
        <SessionExpired />
      ) : (
        <PageTitleProvider>
          <Header />
          <main>
            <Outlet />
          </main>
        </PageTitleProvider>
      )}
      <UpdatePrompt />
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
