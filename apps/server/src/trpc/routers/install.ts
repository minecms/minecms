import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../auth/password';
import { databaseDrivers } from '../../config';
import { createDb, pingDatabase } from '../../db';
import { consumeInstallToken, verifyInstallToken } from '../../install-token';
import { applyUserSchemas, databaseNameFromUrl } from '../../schemas';
import { persistInstallationFile, swapDb } from '../../state';
import { publicProcedure, router, TRPCError } from '../core';

const databaseInput = z.object({
  driver: z.enum(databaseDrivers),
  url: z.string().min(1, 'Подключение к БД не может быть пустым.'),
});

const adminInput = z.object({
  email: z.string().email('Неверный формат e-mail.'),
  password: z.string().min(8, 'Минимум 8 символов.'),
});

const installTokenSchema = z
  .string()
  .min(1, 'Передай install-token из stdout сервера.')
  .regex(/^[0-9a-f]{64}$/, 'Install-token должен быть 64-символьной hex-строкой.');

/**
 * Проверяет, что `installToken` валиден относительно файла на диске. Бросает
 * `UNAUTHORIZED` без подсказки о причине: чтобы атакующий снаружи не мог по
 * сообщению различить «нет файла», «токен не совпал» и «формат битый».
 *
 * После `installation_state = 'installed'` процедуры install.* недоступны
 * вообще (см. ниже) — проверка токена нужна только до установки.
 */
function assertInstallToken(args: { installationFilePath: string; provided: unknown }): void {
  // installation token живёт рядом с installation.json, в `data/install.token`.
  const tokenFilePath = args.installationFilePath.replace(/installation\.json$/, 'install.token');
  if (!verifyInstallToken(args.provided, tokenFilePath)) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message:
        'Неверный install-token. Запусти сервер заново — токен выводится в stdout при старте свежей машины.',
    });
  }
}

function tokenFilePathFromConfig(installationFilePath: string): string {
  return installationFilePath.replace(/installation\.json$/, 'install.token');
}

/**
 * tRPC-роутер install: статус, проверка БД и финализация установки.
 * Все три процедуры остаются доступны и после установки — для read-only `status`,
 * чтобы Studio могла безопасно опросить сервер.
 *
 * Защита от анонимного захвата pristine-инстанса: `testDatabase` и `run`
 * требуют корректный одноразовый `installToken` (создан сервером при первом
 * старте, выведен в stdout). После успешного `run` файл с токеном удаляется.
 */
export const installRouter = router({
  /**
   * Возвращает текущее состояние установки. На свежей машине — `pristine`.
   */
  status: publicProcedure.query(({ ctx }) => {
    return {
      state: ctx.state.installationState,
      driver: ctx.state.config.database?.driver ?? null,
    };
  }),

  /**
   * Открывает временное соединение по присланным кредам, выполняет SELECT 1,
   * закрывает. Не меняет runtime-состояние сервера. Используется кнопкой «Проверить»
   * в первом шаге install-визарда.
   *
   * Защита: после `installed` процедура недоступна вообще; до установки
   * требует корректный `installToken`.
   */
  testDatabase: publicProcedure
    .input(databaseInput.extend({ installToken: installTokenSchema }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.state.installationState === 'installed') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MineCMS уже установлена — проверка БД через install-визард недоступна.',
        });
      }
      assertInstallToken({
        installationFilePath: ctx.state.config.installationFilePath,
        provided: input.installToken,
      });
      try {
        await pingDatabase({ driver: input.driver, url: input.url });
        return { ok: true } as const;
      } catch (error) {
        ctx.state.logger.warn(
          { err: error, driver: input.driver },
          'install.testDatabase: ping failed',
        );
        return {
          ok: false,
          error: 'Не удалось подключиться к базе. Проверь хост, порт, имя БД и креды.',
        } as const;
      }
    }),

  /**
   * Финализация установки: применяет миграции, создаёт админа, фиксирует state,
   * пишет `data/installation.json` и подменяет primary-соединение сервера.
   *
   * Защита: после `installed` процедура отдаёт `FORBIDDEN`; до установки
   * требует корректный `installToken`. После успешного выполнения файл
   * с токеном удаляется.
   */
  run: publicProcedure
    .input(databaseInput.extend({ admin: adminInput, installToken: installTokenSchema }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.state.installationState === 'installed') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MineCMS уже установлена. Повторный install запрещён.',
        });
      }
      assertInstallToken({
        installationFilePath: ctx.state.config.installationFilePath,
        provided: input.installToken,
      });

      try {
        await pingDatabase({ driver: input.driver, url: input.url });
      } catch (error) {
        ctx.state.logger.warn(
          { err: error, driver: input.driver },
          'install.run: ping failed before migrations',
        );
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Не удалось подключиться к базе. Проверь хост, порт, имя БД и креды.',
        });
      }

      const db = await createDb({ driver: input.driver, url: input.url });
      try {
        await db.runMigrations();

        // После применения системных миграций — пушим пользовательские схемы
        // (если в minecms.config.ts они есть). На свежей машине — это первый раз.
        if (ctx.state.userSchemas.length > 0) {
          const databaseName =
            input.driver === 'mysql' ? databaseNameFromUrl('mysql', input.url) : '';
          const result = await applyUserSchemas({
            db,
            schemas: ctx.state.userSchemas,
            databaseName,
            allowDataLoss: ctx.state.config.env.MINECMS_ALLOW_DATA_LOSS,
          });
          if (result.skippedReason) {
            ctx.state.logger.warn(
              { warnings: result.warnings },
              `Пользовательские схемы не применены: ${result.skippedReason}`,
            );
          } else {
            ctx.state.logger.info(
              { applied: result.applied.length, warnings: result.warnings },
              'Пользовательские схемы применены при установке',
            );
          }
        }

        const passwordHash = await hashPassword(input.admin.password);
        if (db.kind === 'mysql') {
          await db.db.insert(db.schema.users).values({
            email: input.admin.email,
            passwordHash,
            role: 'admin',
          });
          await db.db.execute(sql`
            INSERT INTO system_state (\`key\`, \`value\`)
            VALUES ('installation_state', 'installed'), ('installation_driver', ${input.driver})
            ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
          `);
        } else {
          await db.db.insert(db.schema.users).values({
            email: input.admin.email,
            passwordHash,
            role: 'admin',
          });
          await db.db.execute(sql`
            INSERT INTO system_state ("key", "value")
            VALUES ('installation_state', 'installed'), ('installation_driver', ${input.driver})
            ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"
          `);
        }
      } catch (error) {
        await db.close().catch(() => undefined);
        ctx.state.logger.error({ err: error }, 'install.run: failed during migrations or admin');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Не удалось завершить установку. Подробности — в логах сервера; проверь права пользователя БД.',
        });
      }

      await swapDb(ctx.state, db, input.url);
      ctx.state.installationState = 'installed';
      persistInstallationFile({
        filePath: ctx.state.config.installationFilePath,
        driver: input.driver,
        url: input.url,
        state: 'installed',
      });

      // Одноразовый токен использовали — удаляем файл, чтобы повторное использование
      // (даже если злоумышленник перехватил вывод stdout раньше) не сработало.
      consumeInstallToken(tokenFilePathFromConfig(ctx.state.config.installationFilePath));

      ctx.state.logger.info({ driver: input.driver }, 'MineCMS установлена');
      return { ok: true } as const;
    }),
});
