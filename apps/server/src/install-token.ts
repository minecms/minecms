import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from 'pino';

/**
 * Одноразовый install-token. Защищает анонимные `install.*` процедуры от
 * захвата pristine-инстанса до того, как пройдёт визард: атакующий снаружи
 * может постучаться в `install.run`, но без токена получит 401.
 *
 * Контракт:
 * - Токен создаётся **только** при первом старте сервера в `pristine`-состоянии.
 * - Файл `data/install.token`, perm `0600` (`mkdir 0700` для каталога).
 * - При старте токен выводится в stdout (один раз, info-уровень) с инструкцией —
 *   владелец копирует его в форму install-визарда.
 * - После успешного `install.run` файл удаляется (см. `consumeInstallToken`).
 *
 * Длина 64 hex-символа = 32 байта случайных данных — той же стойкости, что
 * `SESSION_SECRET` (см. `auth/session.ts`).
 */

export const INSTALL_TOKEN_LENGTH_BYTES = 32;

/**
 * Гарантирует наличие файла токена. Если файл уже есть — возвращает его
 * содержимое (повторный старт того же pristine-инстанса). Если нет — генерит
 * новый и пишет на диск с perm 0600.
 */
export function ensureInstallToken(filePath: string): string {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8').trim();
    if (isValidTokenShape(existing)) return existing;
    // Сломанный файл — перезаписываем. Это безопасно, потому что pristine-токен
    // никто ещё не использовал успешно (иначе файл был бы удалён).
  }
  const token = randomBytes(INSTALL_TOKEN_LENGTH_BYTES).toString('hex');
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  return token;
}

/**
 * Читает токен с диска без побочных эффектов. Возвращает `null`, если файла нет
 * или его содержимое не похоже на валидный токен.
 */
export function readInstallToken(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    return isValidTokenShape(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Проверяет токен из запроса против диска в постоянное время. Возвращает
 * `true` только при точном совпадении длины и значения.
 *
 * Если файла нет — отдаёт `false`: токен уже потрачен либо инстанс собран
 * без `pristine`-фазы (например, восстановлен из снапшота).
 */
export function verifyInstallToken(provided: unknown, filePath: string): boolean {
  if (typeof provided !== 'string' || !isValidTokenShape(provided)) return false;
  const expected = readInstallToken(filePath);
  if (!expected) return false;
  if (expected.length !== provided.length) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Удаляет файл токена после успешного `install.run`. Идемпотентен —
 * повторный вызов не бросает, если файла уже нет.
 */
export function consumeInstallToken(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    unlinkSync(filePath);
  } catch {
    // Невозможность удалить файл — не блокер установки. Хуже всего, что
    // владельцу придётся стереть его руками; install.run всё равно
    // отдаст 403 благодаря installationState='installed'.
  }
}

/**
 * Один раз при старте сервера в pristine-режиме — выводит токен в stdout.
 * Это **единственный** канал передачи токена владельцу; в Studio форма
 * принимает его как обычный input.
 */
export function logInstallTokenBanner(args: { logger: Logger; token: string }): void {
  const { logger, token } = args;
  logger.info(
    { installToken: token },
    [
      '',
      '═══════════════════════════════════════════════════════════════',
      '  MineCMS · первая установка',
      '═══════════════════════════════════════════════════════════════',
      '  Токен установки (action required):',
      '',
      `    ${token}`,
      '',
      '  Открой Studio и вставь токен в первый шаг install-визарда.',
      '  Токен одноразовый — удалится после успешной установки.',
      '═══════════════════════════════════════════════════════════════',
      '',
    ].join('\n'),
  );
}

function isValidTokenShape(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
