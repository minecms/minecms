import { uploadDevAsset } from '../../dev/state';
import { isUiDevMode } from '../../shared/lib/env';
import type { MediaAsset } from './types';

/** Результат успешной загрузки — сам ассет + URL для просмотра. */
export interface UploadMediaResult {
  asset: MediaAsset;
  viewUrl: string | null;
}

/**
 * Загружает файл через `POST /api/v1/media/upload` (multipart/form-data).
 *
 * В UI-dev-режиме маршрут перехватывается `dev/state.uploadDevAsset` —
 * файл превращается в `data:`-URL и сохраняется in-memory, чтобы не зависеть
 * от backend во время UI-итераций.
 */
export async function uploadMediaFile(file: File): Promise<UploadMediaResult> {
  if (isUiDevMode) {
    return uploadDevAsset(file);
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/v1/media/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Upload failed: ${response.status}`;
    try {
      const err = (await response.json()) as { message?: string; error?: string };
      message = err.message ?? err.error ?? message;
    } catch {
      // оставим дефолтное сообщение со статус-кодом
    }
    throw new Error(message);
  }

  const json = (await response.json()) as { asset: MediaAsset; viewUrl: string | null };
  return json;
}
