/**
 * In-memory обработчики tRPC-операций для UI-dev-режима.
 *
 * Маршрутизация по `op.path` (`install.status`, `auth.login`, `documents.list` и т.д.).
 * Возвращаемые формы повторяют контракт tRPC server, чтобы реальные хуки `@minecms/server`
 * могли работать без отличий — типы по AppRouter сохраняются.
 *
 * Файл попадает в bundle ТОЛЬКО при сборке/разработке с `MINECMS_DEV_MODE=ui`,
 * благодаря `isUiDevMode`-условию в `transport-dev.ts`. В production-сборке
 * импорт `./dev` отсутствует и handlers tree-shake'ятся.
 */
import { devState } from './state';

export interface DevOp {
  type: 'query' | 'mutation' | 'subscription';
  path: string;
  input: unknown;
}

const SLEEP_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Простейший router: switch по `op.path`. Возвращает полезную нагрузку
 * (то, что попадает в `data` на клиенте), либо бросает Error с code и message.
 */
export async function handleDevOperation(op: DevOp): Promise<unknown> {
  await sleep(SLEEP_MS);
  switch (op.path) {
    case 'health':
      return { ok: true, ts: Date.now() };
    case 'install.status':
      return { state: devState.installationState, driver: devState.driver };
    case 'install.testDatabase':
      return handleTestDatabase(op.input as { driver: string; url: string });
    case 'install.run':
      return handleInstallRun(
        op.input as { driver: 'mysql' | 'postgres'; url: string; admin: { email: string } },
      );
    case 'auth.login':
      return handleLogin(op.input as { email: string; password: string });
    case 'auth.logout':
      devState.user = null;
      return { ok: true } as const;
    case 'auth.me':
      return { user: devState.user };
    case 'schemas.list':
      return { schemas: devState.schemas, studioStructure: devState.studioStructure };
    case 'documents.list':
      return handleDocumentsList(op.input as { schema: string; limit?: number; offset?: number });
    case 'documents.count':
      return handleDocumentsCount(op.input as { schema: string });
    case 'documents.get':
      return handleDocumentsGet(op.input as { schema: string; id?: number; slug?: string });
    case 'documents.create':
      return handleDocumentsCreate(op.input as { schema: string; data: Record<string, unknown> });
    case 'documents.update':
      return handleDocumentsUpdate(
        op.input as { schema: string; id: number; data: Record<string, unknown> },
      );
    case 'documents.delete':
      return handleDocumentsDelete(op.input as { schema: string; id: number });
    case 'media.list':
      return handleMediaList(op.input as { limit?: number; offset?: number });
    case 'media.get':
      return handleMediaGet(op.input as { id: number });
    case 'media.getMany':
      return handleMediaGetMany(op.input as { ids: number[] });
    case 'media.update':
      return handleMediaUpdate(op.input as { id: number; alt?: string | null });
    case 'media.delete':
      return handleMediaDelete(op.input as { id: number });
    default:
      throw makeError('NOT_FOUND', `[dev-mode] процедура "${op.path}" не реализована.`);
  }
}

function handleTestDatabase(input: {
  driver: string;
  url: string;
}): { ok: true } | { ok: false; error: string } {
  if (!input.url || input.url.length < 6) {
    return { ok: false, error: 'Слишком короткая строка подключения.' } as const;
  }
  if (input.url.includes('@bad-host')) {
    return { ok: false, error: 'Не удалось подключиться: hostname unreachable.' } as const;
  }
  return { ok: true } as const;
}

function handleInstallRun(input: {
  driver: 'mysql' | 'postgres';
  url: string;
  admin: { email: string };
}): { ok: true } {
  if (devState.installationState === 'installed') {
    throw makeError('FORBIDDEN', 'MineCMS уже установлена в dev-режиме.');
  }
  devState.driver = input.driver;
  devState.installationState = 'installed';
  devState.user = { id: 1, email: input.admin.email, role: 'admin' };
  return { ok: true } as const;
}

function handleLogin(input: { email: string }): {
  ok: true;
  user: { id: number; email: string; role: string };
} {
  if (devState.installationState !== 'installed') {
    throw makeError('FORBIDDEN', 'Сервер ещё не установлен.');
  }
  devState.user = { id: 1, email: input.email, role: 'admin' };
  return { ok: true, user: devState.user } as const;
}

function handleDocumentsList(input: { schema: string; limit?: number; offset?: number }): {
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
} {
  ensureSchema(input.schema);
  const all = devState.documents[input.schema] ?? [];
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
}

function handleDocumentsCount(input: { schema: string }): { total: number } {
  ensureSchema(input.schema);
  return { total: (devState.documents[input.schema] ?? []).length };
}

function handleDocumentsGet(input: { schema: string; id?: number; slug?: string }): {
  item: Record<string, unknown>;
} {
  ensureSchema(input.schema);
  const all = devState.documents[input.schema] ?? [];
  const item =
    input.id !== undefined
      ? all.find((d) => d.id === input.id)
      : input.slug !== undefined
        ? all.find((d) => d.slug === input.slug)
        : undefined;
  if (!item) throw makeError('NOT_FOUND', 'Документ не найден.');
  return { item };
}

function handleDocumentsCreate(input: { schema: string; data: Record<string, unknown> }): {
  ok: true;
  item: Record<string, unknown>;
} {
  ensureSchema(input.schema);
  const meta = devState.schemas.find((s) => s.name === input.schema);
  const existing = devState.documents[input.schema] ?? [];
  if (meta?.singleton && existing.length >= 1) {
    throw makeError(
      'BAD_REQUEST',
      `Схема "${input.schema}" в dev-режиме объявлена как singleton — второй документ создать нельзя.`,
    );
  }
  const id = devState.nextId++;
  const now = new Date().toISOString();
  const item = { id, ...input.data, created_at: now, updated_at: now };
  const list = devState.documents[input.schema] ?? [];
  list.push(item);
  devState.documents[input.schema] = list;
  return { ok: true, item } as const;
}

function handleDocumentsUpdate(input: {
  schema: string;
  id: number;
  data: Record<string, unknown>;
}): { ok: true } {
  ensureSchema(input.schema);
  const list = devState.documents[input.schema] ?? [];
  const idx = list.findIndex((d) => d.id === input.id);
  if (idx === -1) throw makeError('NOT_FOUND', 'Документ не найден.');
  const prev = list[idx] ?? {};
  list[idx] = { ...prev, ...input.data, updated_at: new Date().toISOString() };
  return { ok: true } as const;
}

function handleDocumentsDelete(input: { schema: string; id: number }): { ok: true } {
  ensureSchema(input.schema);
  const list = devState.documents[input.schema] ?? [];
  devState.documents[input.schema] = list.filter((d) => d.id !== input.id);
  return { ok: true } as const;
}

function handleMediaList(input: { limit?: number; offset?: number }): {
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
} {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const slice = devState.media.slice(offset, offset + limit);
  return {
    items: slice.map((a) => ({ ...a })),
    total: devState.media.length,
    limit,
    offset,
  };
}

function handleMediaGet(input: { id: number }): { item: Record<string, unknown> } {
  const item = devState.media.find((a) => a.id === input.id);
  if (!item) throw makeError('NOT_FOUND', 'Медиа-ассет не найден.');
  return { item: { ...item } };
}

function handleMediaGetMany(input: { ids: number[] }): { items: Record<string, unknown>[] } {
  const seen = new Set<number>();
  const items: Record<string, unknown>[] = [];
  for (const id of input.ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const found = devState.media.find((a) => a.id === id);
    if (found) items.push({ ...found });
  }
  return { items };
}

function handleMediaUpdate(input: { id: number; alt?: string | null }): {
  ok: true;
  item: Record<string, unknown>;
} {
  const idx = devState.media.findIndex((a) => a.id === input.id);
  if (idx === -1) throw makeError('NOT_FOUND', 'Медиа-ассет не найден.');
  const prev = devState.media[idx];
  if (!prev) throw makeError('NOT_FOUND', 'Медиа-ассет не найден.');
  const next = {
    ...prev,
    alt: input.alt === undefined ? prev.alt : input.alt,
    updatedAt: new Date().toISOString(),
  };
  devState.media[idx] = next;
  return { ok: true, item: { ...next } } as const;
}

function handleMediaDelete(input: { id: number }): { ok: true } {
  const idx = devState.media.findIndex((a) => a.id === input.id);
  if (idx === -1) throw makeError('NOT_FOUND', 'Медиа-ассет не найден.');
  devState.media.splice(idx, 1);
  return { ok: true } as const;
}

function ensureSchema(name: string): void {
  if (!devState.schemas.some((s) => s.name === name)) {
    throw makeError('NOT_FOUND', `[dev-mode] схема "${name}" не объявлена.`);
  }
}

interface DevError extends Error {
  code: string;
}

function makeError(code: string, message: string): DevError {
  const err = new Error(message) as DevError;
  err.code = code;
  return err;
}
