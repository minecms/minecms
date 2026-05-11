/**
 * Локальная сериализация одного медиа-ассета — зеркало `MediaAssetRow` server'а
 * + `viewUrl` (signed/public). Studio импортирует тип из tRPC AppRouter, но в
 * местах, где нужна именованная переменная (FSD-границы), используем этот alias.
 */
export interface MediaAsset {
  id: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  sha1: string;
  alt: string | null;
  createdAt: string;
  updatedAt: string;
  viewUrl: string | null;
}

/** Краткое отображение размера: 12.3 MB / 245 KB / 980 B. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
