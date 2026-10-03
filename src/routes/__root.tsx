import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Header } from '../components/Header';
import { PageTitleProvider } from '../contexts/PageTitleContext';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Login } from '../views/Login';

const RootComponent = () => {
  const { authState } = useWebSocketContext();

  return authState === 'loginRequired' ? (
    <Login />
  ) : (
    <PageTitleProvider>
      <Header />
      <main>
        <Outlet />
      </main>
    </PageTitleProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
