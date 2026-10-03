import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Header } from '../components/Header';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Login } from '../views/Login';

const RootComponent = () => {
  const { authState } = useWebSocketContext();

  return (
    <>
      {authState === 'loginRequired' ? (
        <Login />
      ) : (
        <>
          <Header />
          <main>
            <Outlet />
          </main>
        </>
      )}
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
