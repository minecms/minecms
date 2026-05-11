import { TRPCError } from '@trpc/server';
import { loadSessionPrincipal, type SessionPrincipal } from '../auth/session-loader';
import { dbProcedure, middleware } from './core';

/**
 * Middleware, читающая session-cookie и кладущая `user`/`sessionId` в контекст.
 * Сама **не блокирует** запрос: даже без сессии вызовет следующий handler
 * (контекстные поля будут `null`). Решение об отказе принимает `requireAuth`.
 *
 * Разделение `loadSession` + `requireAuth` нужно, чтобы публичные процедуры
 * (например, `auth.me`) тоже могли узнать о текущем пользователе без падения,
 * а защищённые — отказывали единообразно через `requireAuth`.
 */
export const loadSession = middleware(async ({ ctx, next }) => {
  const principal = await loadSessionPrincipal(ctx.req, ctx.state);
  return next({
    ctx: {
      ...ctx,
      principal,
    },
  });
});

/**
 * Гард для процедур, требующих авторизованного пользователя. Полагается на
 * предыдущий `loadSession` — если его не было в цепочке, `principal` будет
 * `undefined`, и middleware отдаст `UNAUTHORIZED`.
 *
 * После прохождения через этот гард `ctx.principal` гарантированно валиден —
 * TS подтянет тип через возвращаемый `ctx`.
 */
export const requireAuth = middleware(({ ctx, next }) => {
  const principal = (ctx as { principal?: SessionPrincipal | null }).principal;
  if (!principal) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Требуется авторизация.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      principal,
    },
  });
});

/**
 * Гард для процедур, требующих роли `admin`. Применяется после `requireAuth`,
 * иначе TS не сможет вывести наличие `principal.user.role`.
 *
 * Роли в текущей фазе ограничены `admin`; расширение модели ролей — отдельная
 * фаза в ROADMAP. Пока что вся защита equality-проверка.
 */
export const requireAdmin = middleware(({ ctx, next }) => {
  const principal = (ctx as { principal?: SessionPrincipal | null }).principal;
  if (!principal) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Требуется авторизация.' });
  }
  if (principal.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Недостаточно прав.' });
  }
  return next({
    ctx: {
      ...ctx,
      principal,
    },
  });
});

/**
 * Базовая «авторизованная» процедура: завершённая установка + активная БД +
 * валидная сессия. Все мутации `documents.*`, `media.*`, а также `schemas.list`
 * (раскрывает структуру контент-моделей) живут на ней.
 *
 * Список процедур, которые **не** проходят через эту защиту, явно ограничен:
 *   - `health`, `install.status`              — нужны до установки;
 *   - `install.testDatabase`, `install.run`   — собственная защита через install-token;
 *   - `auth.me`                               — сам по себе проверяет сессию;
 *   - `auth.login`                            — путь к получению сессии (под `dbProcedure`).
 */
export const authenticatedProcedure = dbProcedure.use(loadSession).use(requireAuth);

/**
 * Процедуры с проверкой роли. В текущей фазе совпадает с `authenticatedProcedure`
 * (одна роль `admin`), но семантически — отдельная точка для будущей модели ролей.
 */
export const adminProcedure = authenticatedProcedure.use(requireAdmin);
