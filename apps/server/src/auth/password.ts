import { hash, type Options, verify } from '@node-rs/argon2';

/**
 * Параметры argon2id, рекомендованные OWASP 2024+ для интерактивного логина:
 * память 19 МБ, 2 итерации, 1 параллель. На современном CPU ≈ 50–80 мс.
 *
 * `algorithm: 2` — это `Algorithm.Argon2id` из @node-rs/argon2; numeric literal
 * используется явно из-за ограничения `verbatimModuleSyntax`, запрещающего
 * импорт ambient const enum.
 */
const argonOptions = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} satisfies Options;

/** Хеширует пароль, возвращает PHC-строку argon2id. */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error('Пароль должен быть минимум 8 символов.');
  }
  return await hash(plain, argonOptions);
}

/**
 * Проверяет пароль против сохранённого хеша. Не бросает на неверном пароле —
 * возвращает `false`, чтобы вызывающий код принял решение по ответу клиенту.
 */
export async function verifyPassword(plain: string, hashString: string): Promise<boolean> {
  try {
    return await verify(hashString, plain);
  } catch {
    return false;
  }
}
