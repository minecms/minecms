import { TooltipProvider } from '@minecms/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createAppTRPCClient, trpc } from '../shared/api/client';

/**
 * React-провайдеры верхнего уровня: QueryClient + tRPC.
 *
 * Создаётся по одному инстансу на компонент-приложение (через `useState`),
 * чтобы StrictMode-двойной-render в dev не плодил лишние клиенты.
 */
export function AppProviders(props: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createAppTRPCClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200} skipDelayDuration={100}>
          {props.children}
        </TooltipProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
