import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { Room } from './views/Room';
import { Rooms } from './views/Rooms';

export const Router = () => {
  const basename = process.env.NODE_ENV === 'production' ? '/addons/mui/' : '/';
  const router = createBrowserRouter(
    [
      {
        path: '/',
        element: <Navigate to="/rooms" />,
      },
      {
        path: '/rooms',
        element: (
          <Rooms />
        ),
      },
      {
        path: '/room/:roomId',
        element: (
          <Room />
        ),
      }
    ],
    { basename }
  );

  return <RouterProvider router={router} />;
};
