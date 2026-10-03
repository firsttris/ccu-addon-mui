import { createRootRoute, Outlet } from '@tanstack/react-router';
import { css, Global } from '@emotion/react';
import { Header } from '../components/Header';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { Login } from '../views/Login';

const RootComponent = () => {
  const { authState } = useWebSocketContext();

  return (
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
