import { type Logger, type LoggerOptions, pino, stdSerializers } from 'pino';
import type { ServerEnv } from './config';

/**
 * Создаёт настроенный pino-логгер. В development подключается pino-pretty
 * через transport — в production остаётся чистый JSON для агрегаторов (Loki, Datadog и т.п.).
 *
 * Сериализатор `error` нужен потому, что без него `logger.error({ error })` печатает
 * пустой объект — pino по умолчанию умеет только ключ `err`, а в коде сервера
 * привычнее писать `error`. Добавляем оба варианта.
 */
export function createLogger(env: Pick<ServerEnv, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: 'minecms-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: stdSerializers.err,
      error: stdSerializers.err,
    },
  };

  if (env.NODE_ENV === 'development') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service',
        },
      },
    });
  }

  return pino(options);
}
