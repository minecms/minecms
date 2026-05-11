import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { verifyPassword } from '../../auth/password';
import {
  generateSessionId,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  signValue,
  unsignValue,
} from '../../auth/session';
import { dbProcedure, publicProcedure, router, TRPCError } from '../core';
import { authenticatedProcedure } from '../middlewares';

const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Извлекает идентификатор сессии из подписанного cookie.
 * Возвращает `null` при отсутствии или невалидной подписи.
 */
function readSessionId(
  req: { cookies?: Record<string, string | undefined> },
  secret: string,
): string | null {
  const raw = req.cookies?.[SESSION_COOKIE_NAME];
  if (!raw) return null;
  return unsignValue(raw, secret);
}

export const authRouter = router({
  /**
   * Аутентификация по e-mail/паролю. На успехе пишет signed cookie и создаёт
   * запись в `sessions`. На ошибке возвращает UNAUTHORIZED без подсказки,
   * существует ли вообще такой пользователь — типичная защита от перебора.
   */
  login: dbProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const { db } = ctx;
    const userRows =
      db.kind === 'mysql'
        ? await db.db
            .select()
            .from(db.schema.users)
            .where(eq(db.schema.users.email, input.email))
            .limit(1)
        : await db.db
            .select()
            .from(db.schema.users)
            .where(eq(db.schema.users.email, input.email))
            .limit(1);
    const user = userRows[0];
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Неверный e-mail или пароль.' });
    }

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Неверный e-mail или пароль.' });
    }

    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    if (db.kind === 'mysql') {
      await db.db.insert(db.schema.sessions).values({ id: sessionId, userId: user.id, expiresAt });
    } else {
      await db.db.insert(db.schema.sessions).values({ id: sessionId, userId: user.id, expiresAt });
    }

    const signed = signValue(sessionId, ctx.state.config.env.SESSION_SECRET);
    ctx.res.setCookie(SESSION_COOKIE_NAME, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.state.config.env.NODE_ENV === 'production',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });

    return { ok: true, user: { id: user.id, email: user.email, role: user.role } } as const;
  }),

  /**
   * Удаляет запись сессии и стирает cookie. Требует валидную сессию —
   * иначе нет смысла что-либо удалять; UNAUTHORIZED отдаём явно.
   */
  logout: authenticatedProcedure.mutation(async ({ ctx }) => {
    const { db } = ctx;
    const sessionId = readSessionId(ctx.req, ctx.state.config.env.SESSION_SECRET);
    if (sessionId) {
      if (db.kind === 'mysql') {
        await db.db.delete(db.schema.sessions).where(eq(db.schema.sessions.id, sessionId));
      } else {
        await db.db.delete(db.schema.sessions).where(eq(db.schema.sessions.id, sessionId));
      }
    }
    ctx.res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true } as const;
  }),

  /**
   * Возвращает текущего пользователя по сессии или `null`, если кук нет/они невалидны.
   * Используется Studio при загрузке для решения «показать login или dashboard».
   */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.state.db) return { user: null } as const;

    const sessionId = readSessionId(ctx.req, ctx.state.config.env.SESSION_SECRET);
    if (!sessionId) return { user: null } as const;

    const db = ctx.state.db;
    if (db.kind === 'mysql') {
      const rows = await db.db
        .select({
          userId: db.schema.sessions.userId,
          expiresAt: db.schema.sessions.expiresAt,
          email: db.schema.users.email,
          role: db.schema.users.role,
        })
        .from(db.schema.sessions)
        .innerJoin(db.schema.users, eq(db.schema.users.id, db.schema.sessions.userId))
        .where(eq(db.schema.sessions.id, sessionId))
        .limit(1);
      const row = rows[0];
      if (!row || row.expiresAt.getTime() < Date.now()) return { user: null } as const;
      return {
        user: { id: row.userId, email: row.email, role: row.role },
      } as const;
    }

    const rows = await db.db
      .select({
        userId: db.schema.sessions.userId,
        expiresAt: db.schema.sessions.expiresAt,
        email: db.schema.users.email,
        role: db.schema.users.role,
      })
      .from(db.schema.sessions)
      .innerJoin(db.schema.users, eq(db.schema.users.id, db.schema.sessions.userId))
      .where(eq(db.schema.sessions.id, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row || row.expiresAt.getTime() < Date.now()) return { user: null } as const;
    return {
      user: { id: row.userId, email: row.email, role: row.role },
    } as const;
  }),
});
