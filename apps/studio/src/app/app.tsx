import { RouterProvider } from '@tanstack/react-router';
import { router } from '../shared/routes/router';
import { AppProviders } from './providers';

/**
 * Корневой компонент Studio. Соединяет провайдеры (QueryClient + tRPC) с
 * TanStack Router'ом — всё, что внутри роутов, имеет доступ к `trpc.*`-хукам.
 */
export function App(): React.JSX.Element {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
