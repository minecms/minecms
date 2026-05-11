import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Генерирует криптостойкий идентификатор сессии длиной 32 байта.
 * 64 hex-символа влезают в `varchar(64)` и достаточны для коллизионной стойкости.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Подписывает значение HMAC-SHA-256 от секрета.
 * Формат: `${value}.${hmacBase64Url}`. Base64URL экономит 33% длины относительно hex.
 */
export function signValue(value: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

/**
 * Проверяет подпись и возвращает исходное значение или `null`, если подпись невалидна.
 * Сравнение в постоянное время: timingSafeEqual блокирует тайминг-атаки.
 */
export function unsignValue(signed: string, secret: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const provided = signed.slice(lastDot + 1);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');

  const a = Buffer.from(provided, 'base64url');
  const b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return value;
}

/**
 * Длительность сессии по умолчанию — 14 дней. Не extension-friendly:
 * каждая успешная запись логина создаёт новую запись в `sessions`.
 */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = 'minecms_session';
