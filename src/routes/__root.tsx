import { createRootRoute, Outlet } from '@tanstack/react-router';
import { css, Global } from '@emotion/react';

export const Route = createRootRoute({
  component: () => (
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
      <Outlet />
    </>
  ),
});
