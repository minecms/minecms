import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { loadSessionUserId } from '../auth/session-loader';
import { SUPPORTED_IMAGE_MIME, saveUploadedAsset } from '../media/upload-handler';
import type { ServerState } from '../state';

interface MediaOptions {
  state: ServerState;
}

/**
 * Регистрирует загрузку файлов через multipart.
 *
 * Защита: только авторизованный пользователь Studio (signed cookie сессии).
 * До прохождения install-визарда отдаём 503; до подключения хранилища — тоже 503.
 *
 * Маршрут: `POST /api/v1/media/upload` (Content-Type: multipart/form-data,
 * поле `file`). Ответ: `{ asset: MediaAssetRow, viewUrl: string }`.
 */
async function registerMedia(app: FastifyInstance, opts: MediaOptions): Promise<void> {
  const { state } = opts;
  const maxFileSize = state.config.storage?.maxFileSize ?? 25 * 1024 * 1024;

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: maxFileSize,
      // Заголовки и поля в multipart не должны быть огромными — иначе атака памяти.
      fields: 5,
      headerPairs: 200,
    },
  });

  app.post('/api/v1/media/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    if (state.installationState !== 'installed' || !state.db) {
      return reply.code(503).send({
        error: 'INSTALL_REQUIRED',
        message: 'MineCMS ещё не установлена.',
      });
    }
    if (!state.storage) {
      return reply.code(503).send({
        error: 'STORAGE_NOT_CONFIGURED',
        message:
          'S3-хранилище не настроено. Проверь S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.',
      });
    }

    const userId = await loadSessionUserId(req, state);
    if (userId === null) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: 'NO_FILE', message: 'Файл не передан.' });
    }
    if (!SUPPORTED_IMAGE_MIME.has(file.mimetype)) {
      return reply.code(415).send({
        error: 'UNSUPPORTED_MIME',
        message: `Mime-тип "${file.mimetype}" не поддерживается. Разрешены: ${[...SUPPORTED_IMAGE_MIME].join(', ')}.`,
      });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      // toBuffer бросает, если файл превысил `fileSize` лимит — это нормальный 413.
      const message = (err as Error).message ?? 'unknown';
      if (message.toLowerCase().includes('reached size limit')) {
        return reply.code(413).send({
          error: 'FILE_TOO_LARGE',
          message: `Файл превышает лимит ${Math.round(maxFileSize / 1024 / 1024)} MB.`,
        });
      }
      throw err;
    }

    try {
      const asset = await saveUploadedAsset({
        db: state.db,
        state,
        input: { filename: file.filename, mimetype: file.mimetype, body: buffer },
      });
      const viewUrl = await state.storage.getViewUrl(asset.storageKey);
      return reply.code(201).send({ asset, viewUrl });
    } catch (err) {
      req.log.error({ err }, 'media upload failed');
      return reply.code(500).send({
        error: 'UPLOAD_FAILED',
        message: (err as Error).message ?? 'Не удалось сохранить файл.',
      });
    }
  });
}

export const mediaPlugin = fp(registerMedia);
