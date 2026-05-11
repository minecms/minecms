import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config';

/**
 * Тонкая обёртка над S3-клиентом. Один инстанс на процесс — переиспользует
 * keep-alive соединения, что критично для серии последовательных upload'ов.
 *
 * Все S3-совместимые сервисы (MinIO, Cloudflare R2, Backblaze B2, …) работают
 * через тот же `@aws-sdk/client-s3`: единственное отличие — `endpoint` и
 * `forcePathStyle`, которые приходят из `StorageConfig`.
 */
export class MediaStorage {
  private readonly client: S3Client;

  constructor(public readonly config: StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
    });
  }

  /**
   * Заливает байтовый буфер по ключу. Метаданные (имя, mime) идут как часть
   * S3-запроса, чтобы клиенты могли получить корректный `Content-Type`.
   */
  async putObject(args: {
    key: string;
    body: Buffer;
    contentType: string;
    contentDisposition?: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType,
        ...(args.contentDisposition ? { ContentDisposition: args.contentDisposition } : {}),
      }),
    );
  }

  /** Удаляет объект по ключу. Идемпотентно — отсутствующий объект не ошибка. */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  /**
   * Возвращает URL для отображения объекта в Studio.
   *
   * Если в конфиге указан `publicUrl` (CDN, MinIO console и т.п.) —
   * собираем прямую ссылку без подписи. Иначе генерируем временную
   * presigned-URL (TTL по умолчанию 1 час).
   */
  async getViewUrl(key: string, ttlSeconds = 3600): Promise<string> {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl}/${this.config.bucket}/${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  /** Закрывает HTTP-агента — вызывается при остановке сервера. */
  destroy(): void {
    this.client.destroy();
  }
}

/**
 * Генерирует уникальный ключ объекта. Формат — `<prefix>/<yyyy>/<mm>/<sha1>-<safeName>.<ext>`.
 *
 * Sha1 в имени защищает от коллизий при одинаковых исходных именах файлов;
 * сам файл всё равно хранится один раз — server.routes.upload проверяет
 * `media_assets.sha1` уникально и не пишет в S3 повторно.
 */
export function generateObjectKey(args: {
  prefix: string;
  originalFilename: string;
  sha1: string;
  date?: Date;
}): string {
  const date = args.date ?? new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const baseName = sanitizeFilename(args.originalFilename);
  return [args.prefix, yyyy, mm, `${args.sha1.slice(0, 12)}-${baseName}`].filter(Boolean).join('/');
}

/**
 * Удаляет всё, что не безопасно в URL/ключе S3, оставляя только
 * `[a-z0-9._-]`. Регистр приводится к нижнему — единственный простой способ
 * избежать проблем с case-sensitive backend'ами.
 */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
  const cut = replaced.replace(/^-+|-+$/g, '');
  return cut.length > 0 ? cut.slice(0, 120) : 'file';
}
