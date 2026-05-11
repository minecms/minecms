/**
 * In-memory состояние UI-dev-режима. Активируется через `MINECMS_DEV_MODE=ui`,
 * никогда не попадает в production-бандл (tree-shake по `isUiDevMode`).
 *
 * Не делать здесь сложные структуры — это исключительно подложка для прохождения
 * экранов Studio без backend. Реальная семантика — в `apps/server`.
 */
import type { SerializedSchema, SerializedStudioStructurePane } from './types';

export interface DevMediaAsset {
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
  viewUrl: string;
}

export interface DevState {
  installationState: 'pristine' | 'installed';
  driver: 'mysql' | 'postgres' | null;
  user: { id: number; email: string; role: string } | null;
  schemas: SerializedSchema[];
  studioStructure: SerializedStudioStructurePane | null;
  documents: Record<string, Record<string, unknown>[]>;
  media: DevMediaAsset[];
  nextId: number;
  nextMediaId: number;
}

const SAMPLE_SCHEMAS: SerializedSchema[] = [
  {
    name: 'navigation',
    type: 'navigation',
    pluralName: 'navigations',
    label: 'Навигация',
    icon: 'Menu01Icon',
    order: -15,
    singleton: true,
    routeField: null,
    timestamps: true,
    fields: {
      title: { type: 'string', label: 'Название', optional: false, max: 120 },
      notes: { type: 'text', label: 'Черновик / заметки', optional: true },
    },
  },
  {
    name: 'home',
    type: 'home',
    pluralName: 'homes',
    label: 'Главная',
    icon: 'Home01Icon',
    order: -10,
    singleton: true,
    routeField: null,
    timestamps: true,
    fields: {
      title: { type: 'string', label: 'Заголовок', optional: false, max: 200 },
      intro: { type: 'text', label: 'Вступление', optional: true },
    },
  },
  {
    name: 'pages',
    type: 'pages',
    pluralName: 'pages',
    label: 'Страницы',
    icon: 'Home01Icon',
    order: 0,
    singleton: false,
    routeField: 'slug',
    timestamps: true,
    fields: {
      title: { type: 'string', label: 'Заголовок', optional: false, max: 200 },
      slug: { type: 'slug', label: 'Slug', optional: false, unique: true, source: 'title' },
      body: { type: 'text', label: 'Содержимое', optional: true },
    },
  },
  {
    name: 'post',
    type: 'post',
    pluralName: 'posts',
    label: 'Записи блога',
    icon: 'File01Icon',
    order: 10,
    singleton: false,
    routeField: 'slug',
    timestamps: true,
    fields: {
      title: { type: 'string', label: 'Заголовок', optional: false },
      slug: { type: 'slug', label: 'Slug', optional: false, unique: true, source: 'title' },
      published: { type: 'boolean', label: 'Опубликовано', optional: false, default: false },
    },
  },
];

const SAMPLE_STUDIO_STRUCTURE: SerializedStudioStructurePane = {
  title: 'Контент',
  items: [
    { kind: 'schema', name: 'navigation' },
    { kind: 'divider' },
    { kind: 'schema', name: 'home' },
    { kind: 'schema', name: 'pages' },
    { kind: 'divider' },
    { kind: 'schema', name: 'post' },
  ],
};

export const devState: DevState = {
  installationState: 'pristine',
  driver: null,
  user: null,
  schemas: SAMPLE_SCHEMAS,
  studioStructure: SAMPLE_STUDIO_STRUCTURE,
  documents: {
    navigation: [],
    home: [],
    pages: [
      {
        id: 1,
        title: 'Главная',
        slug: 'index',
        body: 'Демо-страница из ui-dev режима.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    post: [],
  },
  media: [],
  nextId: 100,
  nextMediaId: 1,
};

/**
 * Сохраняет загруженный файл как `data:`-URL и возвращает форму, идентичную
 * REST-ответу `POST /api/v1/media/upload` — чтобы UI-dev-режим был неотличим
 * от production пути. SHA1 не считаем — для UI-итераций неважно.
 */
export async function uploadDevAsset(
  file: File,
): Promise<{ asset: DevMediaAsset; viewUrl: string }> {
  const buffer = await file.arrayBuffer();
  const dataUrl = await blobToDataUrl(file);
  const dims = await readImageDimensions(file).catch(() => ({ width: null, height: null }));
  const now = new Date().toISOString();
  const asset: DevMediaAsset = {
    id: devState.nextMediaId++,
    storageKey: `dev/${file.name}`,
    originalFilename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.byteLength,
    width: dims.width,
    height: dims.height,
    sha1: cryptoRandomHex(40),
    alt: null,
    createdAt: now,
    updatedAt: now,
    viewUrl: dataUrl,
  };
  devState.media.unshift(asset);
  return { asset, viewUrl: dataUrl };
}

function cryptoRandomHex(len: number): string {
  const arr = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function readImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve({ width: null, height: null });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
