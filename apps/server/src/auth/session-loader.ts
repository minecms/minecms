import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { ServerState } from '../state';
import { SESSION_COOKIE_NAME, unsignValue } from './session';

/**
 * Минимальный срез сессии и пользователя, который кладётся в tRPC-контекст
 * и читается в Fastify-плагинах (media upload). Не содержит `passwordHash`
 * и других секретов — только то, что нужно для AuthZ-решений.
 */
export interface SessionPrincipal {
  user: { id: number; email: string; role: string };
  sessionId: string;
  expiresAt: Date;
}

/**
 * Загружает пользователя и сессию по подписанной cookie. Возвращает `null` при
 * любом из условий: cookie нет, подпись невалидна, сессии нет в БД, сессия истекла.
 *
 * Дёргается из tRPC-middleware (через адаптер запроса Fastify) и из media-плагина
 * — единая точка чтения сессии, чтобы AuthN-логика не дублировалась.
 *
 * Никаких side-effects: не продлевает сессию, не пишет в логи. Только чистая
 * проверка «есть валидная сессия». Решение о доступе (`requireAuth`/`requireAdmin`)
 * принимает вызывающий код.
 */
export async function loadSessionPrincipal(
  req: { cookies?: Record<string, string | undefined> },
  state: ServerState,
): Promise<SessionPrincipal | null> {
  const raw = req.cookies?.[SESSION_COOKIE_NAME];
  if (!raw) return null;

  const sessionId = unsignValue(raw, state.config.env.SESSION_SECRET);
  if (!sessionId) return null;

  const db = state.db;
  if (!db) return null;

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
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return {
      user: { id: row.userId, email: row.email, role: row.role },
      sessionId,
      expiresAt: row.expiresAt,
    };
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
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return {
    user: { id: row.userId, email: row.email, role: row.role },
    sessionId,
    expiresAt: row.expiresAt,
  };
}

/**
 * Адаптер для Fastify-плагинов, которым нужен только `userId` (media upload).
 * Сохраняет старый контракт `readSessionUserId`, теперь поверх общей загрузки.
 */
export async function loadSessionUserId(
  req: FastifyRequest,
  state: ServerState,
): Promise<number | null> {
  const principal = await loadSessionPrincipal(req, state);
  return principal?.user.id ?? null;
}
