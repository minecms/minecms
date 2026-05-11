import { initTRPC, TRPCError } from '@trpc/server';
import type { TrpcContext } from './context';

/**
 * Корневой tRPC-инициализатор. Здесь живут общие middleware и фабрики процедур.
 * Любой пакет server-side кода обращается к tRPC только через этот модуль.
 *
 * Иерархия процедур:
 *   publicProcedure          ← без гардов
 *     └ dbProcedure          ← installRequired + наличие активного `state.db`
 *         └ authenticatedProcedure ← loadSession + requireAuth (есть `principal.user`)
 *             └ adminProcedure    ← requireAdmin (role === 'admin')
 *
 * AuthN/AuthZ middleware импортируются из `./middlewares` ниже, чтобы избежать
 * циклической зависимости с `core` (middleware-фабрика живёт здесь).
 */
const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export { TRPCError };

/**
 * Middleware, блокирующее любые tRPC-процедуры пока
 * `system_state.installation_state != 'installed'`. На свежей машине это
 * единственный способ для Studio не «упасть» в auth до прохождения визарда.
 *
 * Применяется только к роутерам, чувствительным к состоянию установки —
 * сами install.* остаются без него (они и есть путь к завершению установки).
 */
export const installRequired = middleware(({ ctx, next }) => {
  if (ctx.state.installationState !== 'installed') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Сервер находится в режиме первичной установки. Доступны только процедуры install.*.',
    });
  }
  return next();
});

/**
 * Гард, гарантирующий что в контексте есть подключение к БД.
 * Применяется к процедурам, которым нечего делать без installed-инстанса.
 */
export const dbProcedure = publicProcedure.use(installRequired).use(({ ctx, next }) => {
  if (!ctx.state.db) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'База данных ещё не настроена. Пройди install-визард.',
    });
  }
  return next({ ctx: { ...ctx, db: ctx.state.db } });
});
