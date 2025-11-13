import { createRootRoute, Outlet } from '@tanstack/react-router';
import { css, Global } from '@emotion/react';
import { Header } from '../components/Header';

const RootComponent = () => {
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
      <Header />
      <Outlet />
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
