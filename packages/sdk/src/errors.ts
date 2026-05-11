/**
 * Ошибка SDK при общении с MineCMS-server.
 *
 * Содержит HTTP-статус и сообщение из тела ответа (если оно похоже на
 * `{ error: { message } }`). Network-ошибки оборачиваются с `status: 0`.
 */
export class MineCMSError extends Error {
  /** HTTP-статус ответа, либо `0` для network-ошибок. */
  readonly status: number;
  /** Машиночитаемый код, если server его прислал; иначе `'INTERNAL'`. */
  readonly code: string;

  constructor(message: string, options: { status: number; code?: string; cause?: unknown }) {
    super(message);
    this.name = 'MineCMSError';
    this.status = options.status;
    this.code = options.code ?? 'INTERNAL';
    if (options.cause !== undefined) {
      // ES2022 supports Error.cause natively
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
