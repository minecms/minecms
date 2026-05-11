import { TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { handleDevOperation } from '../../dev';

/**
 * Терминирующий tRPC-link для UI-dev-режима.
 *
 * Заменяет HTTP-слой: каждое поднятое в клиенте `useQuery`/`useMutation`
 * передаётся прямо в `handleDevOperation` из `src/dev/handlers.ts`. Backend
 * не нужен. В production-сборке этот файл не импортируется (см. `client.ts`).
 *
 * Заметки по реализации:
 * - оборачиваем ошибки в `TRPCClientError`, чтобы хуки получили привычный shape
 *   и UI-код мог одинаково обрабатывать real- и dev-ошибки.
 * - subscriptions не поддерживаем — для UI-dev-режима не нужны, бросаем явно.
 */
export function createDevLink<TRouter extends AnyTRPCRouter>(): TRPCLink<TRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        if (op.type === 'subscription') {
          observer.error(
            devClientError<TRouter>(
              'METHOD_NOT_SUPPORTED',
              '[dev-mode] subscriptions не поддерживаются.',
            ),
          );
          return;
        }

        let cancelled = false;
        handleDevOperation({ type: op.type, path: op.path, input: op.input }).then(
          (data) => {
            if (cancelled) return;
            observer.next({ result: { type: 'data', data } });
            observer.complete();
          },
          (error: unknown) => {
            if (cancelled) return;
            observer.error(toClientError<TRouter>(error));
          },
        );
        return () => {
          cancelled = true;
        };
      });
    };
  };
}

function toClientError<TRouter extends AnyTRPCRouter>(error: unknown): TRPCClientError<TRouter> {
  if (error instanceof TRPCClientError) return error as TRPCClientError<TRouter>;
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'INTERNAL_SERVER_ERROR';
  return devClientError<TRouter>(code, message);
}

function devClientError<TRouter extends AnyTRPCRouter>(
  code: string,
  message: string,
): TRPCClientError<TRouter> {
  return new TRPCClientError<TRouter>(message, {
    result: {
      error: {
        message,
        code: -32603,
        data: { code, httpStatus: 500 },
      },
    } as never,
  });
}
