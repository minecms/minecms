import type { InferSdkSchemaType, SchemaDefinition } from '@minecms/core';
import { MineCMSError } from './errors';

/**
 * Параметры одного REST-запроса к серверу.
 *
 * `fetch` подменяется в тестах и в средах без глобального `fetch` (Node < 18,
 * нестандартные runtime'ы). По умолчанию используется `globalThis.fetch`.
 */
export interface ClientOptions<TSchemas extends SchemaMap> {
  /** Базовый URL MineCMS-server, например `https://cms.example.com`. */
  url: string;
  /** Bearer-токен для приватных эндпоинтов. На текущей фазе REST-API публичный. */
  token?: string;
  /** Карта схем, обычно вытащенная из `minecms.config.ts`. */
  schemas: TSchemas;
  /** Кастомный `fetch`. Обычно не нужен — используется `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Дополнительные заголовки, добавляются ко всем запросам. */
  headers?: Record<string, string>;
}

/** Опции списка документов. */
export interface ListOptions {
  /** Сколько документов вернуть. По умолчанию — 50, server ограничивает 200. */
  limit?: number;
  /** Сколько документов пропустить. По умолчанию 0. */
  offset?: number;
  /** AbortSignal — для отмены при размонтировании компонента и т.п. */
  signal?: AbortSignal;
}

/** Результат запроса списка. */
export interface ListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Карта схем — то, что пользователь импортирует из своего `minecms.config.ts`. */
export type SchemaMap = Record<string, SchemaDefinition>;

/**
 * Клиент одной схемы.
 *
 * Тип элемента — `InferSdkSchemaType<S>`: совпадает с `InferSchemaType<S>`,
 * но `image`-поля приходят расширенными (`ImageAssetValue` с готовым `url`,
 * размерами и mime-типом). Сервер раскрывает их в REST автоматически —
 * клиент не делает N+1 запросов на media.
 */
export interface SchemaClient<S extends SchemaDefinition> {
  /** Список документов с пагинацией. */
  list(options?: ListOptions): Promise<ListResult<InferSdkSchemaType<S>>>;
  /** Один документ по значению `routeField` (обычно — slug). */
  get(slug: string, options?: { signal?: AbortSignal }): Promise<InferSdkSchemaType<S>>;
}

/** Корневой клиент: per-schema клиенты по ключам исходной карты схем. */
export type Client<TSchemas extends SchemaMap> = {
  [K in keyof TSchemas]: SchemaClient<TSchemas[K]>;
};

/**
 * Создаёт типизированный клиент MineCMS.
 *
 * Тип каждого `client.<schema>.list()` / `.get()` выводится из соответствующего
 * `defineSchema()` через `InferSchemaType` — так фронтенду не нужно дублировать
 * формы документов.
 *
 * @example
 * ```ts
 * import { createClient } from '@minecms/sdk';
 * import { schemas } from '../minecms.config';
 *
 * const cms = createClient({ url: 'https://cms.example.com', schemas });
 * const { items } = await cms.pages.list();
 * const doc = await cms.pages.get('about');
 * ```
 */
export function createClient<TSchemas extends SchemaMap>(
  options: ClientOptions<TSchemas>,
): Client<TSchemas> {
  const baseUrl = options.url.replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      '[@minecms/sdk] `fetch` недоступен в этой среде. Передай реализацию через `options.fetch`.',
    );
  }

  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.token) {
    baseHeaders.Authorization = `Bearer ${options.token}`;
  }

  const client = {} as Client<TSchemas>;
  for (const key of Object.keys(options.schemas) as Array<keyof TSchemas>) {
    const schema = options.schemas[key] as SchemaDefinition;
    const schemaName = schema.name;
    (client as Record<string, SchemaClient<SchemaDefinition>>)[key as string] = {
      async list(listOptions) {
        const params = new URLSearchParams();
        if (listOptions?.limit !== undefined) params.set('limit', String(listOptions.limit));
        if (listOptions?.offset !== undefined) params.set('offset', String(listOptions.offset));
        const qs = params.size > 0 ? `?${params.toString()}` : '';
        const url = `${baseUrl}/api/v1/${encodeURIComponent(schemaName)}${qs}`;
        const data = (await request(
          fetchImpl,
          url,
          baseHeaders,
          listOptions?.signal,
        )) as ListResult<unknown>;
        return data as ListResult<InferSdkSchemaType<SchemaDefinition>>;
      },
      async get(slug, getOptions) {
        if (!slug) {
          throw new MineCMSError('SDK: пустой slug в client.get()', {
            status: 0,
            code: 'BAD_REQUEST',
          });
        }
        const url = `${baseUrl}/api/v1/${encodeURIComponent(schemaName)}/${encodeURIComponent(slug)}`;
        const data = (await request(fetchImpl, url, baseHeaders, getOptions?.signal)) as {
          item: unknown;
        };
        if (!data || typeof data !== 'object' || !('item' in data)) {
          throw new MineCMSError('SDK: неожиданный формат ответа сервера.', {
            status: 0,
            code: 'BAD_RESPONSE',
          });
        }
        return data.item as InferSdkSchemaType<SchemaDefinition>;
      },
    };
  }
  return client;
}

/**
 * Внутренняя функция: выполняет HTTP-запрос и парсит JSON-ответ. Унифицирует
 * обработку ошибок (network/HTTP/JSON), чтобы клиент не разбирал это в каждом методе.
 */
async function request(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, signal !== undefined ? { headers, signal } : { headers });
  } catch (cause) {
    throw new MineCMSError(cause instanceof Error ? cause.message : 'Network error', {
      status: 0,
      code: 'NETWORK',
      cause,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (response.ok) {
      throw new MineCMSError('SDK: ответ сервера не валидный JSON.', {
        status: response.status,
        code: 'BAD_RESPONSE',
        cause,
      });
    }
    body = null;
  }

  if (!response.ok) {
    const parsed = parseHttpErrorBody(body, response.status);
    const message = parsed?.message ?? `HTTP ${response.status}`;
    const code = parsed?.code;
    throw new MineCMSError(message, {
      status: response.status,
      ...(code ? { code } : {}),
    });
  }

  return body;
}

/**
 * Разбор тел ошибок REST: вложенный `{ error: { message, code } }` и плоский
 * `{ error: string, message?: string }` как в `@minecms/server/src/plugins/rest.ts`.
 */
function parseHttpErrorBody(
  body: unknown,
  status: number,
): { message: string; code: string } | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const o = body as Record<string, unknown>;

  if ('error' in o && typeof o.error === 'object' && o.error !== null && !Array.isArray(o.error)) {
    const e = o.error as Record<string, unknown>;
    const message = typeof e.message === 'string' ? e.message : undefined;
    const code = typeof e.code === 'string' ? e.code : undefined;
    if (message !== undefined || code !== undefined) {
      return {
        message: message ?? code ?? `HTTP ${status}`,
        code: code ?? 'INTERNAL',
      };
    }
  }

  if (typeof o.error === 'string') {
    const code = o.error;
    let message: string;
    if (typeof o.message === 'string' && o.message.length > 0) {
      message = o.message;
    } else if (typeof o.schema === 'string') {
      message = `${code} (schema: ${o.schema})`;
    } else {
      message = code;
    }
    return { message, code };
  }

  return null;
}
