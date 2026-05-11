/**
 * Типы декларативной системы схем MineCMS.
 *
 * Все поля и схемы определяются через `defineField` и `defineSchema`,
 * после чего их структура остаётся доступной как для рантайма (валидация,
 * автогенерация миграций, рендер форм), так и для type-level вывода
 * (`InferSchemaType<typeof schema>`).
 */

/** Базовые опции, общие для всех типов полей. */
export type BaseFieldOptions = {
  /** Человекочитаемая подпись для UI (ru). */
  label: string;
  /** Подсказка для пользователя (ru). */
  description?: string;
  /**
   * Если `true`, значение поля может быть `null` в документе.
   * По умолчанию — `false` (поле обязательно).
   */
  optional?: boolean;
};

/** Поле "string" — короткий однострочный текст. */
export type StringField = BaseFieldOptions & {
  type: 'string';
  min?: number;
  max?: number;
  /** Регулярное выражение для строгой проверки формата. */
  pattern?: RegExp;
};

/** Поле "text" — многострочный текст без форматирования. */
export type TextField = BaseFieldOptions & {
  type: 'text';
  min?: number;
  max?: number;
};

/**
 * Узел rich-text-документа в формате ProseMirror/TipTap.
 *
 * Минимальный whitelist полей: `type`, опциональные `text`, `attrs`, `content`,
 * `marks`. Дополнительные поля игнорируются — это сознательно, чтобы редактор
 * мог расширяться без миграций контента.
 */
export type RichTextMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichTextNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
};

export type RichTextDoc = {
  type: 'doc';
  content?: RichTextNode[];
};

/**
 * Доступные расширения rich-text-редактора.
 *
 * Включаются через `features` в `defineField.richText`. Если массив не задан или
 * пуст — применяется минимальный baseline `['bold', 'italic']`. Каждая фича
 * либо добавляет mark/node, либо кнопку в toolbar.
 *
 * `paragraph`/`history`/`hardBreak` всегда активны (без них не работает базовая
 * редактируемость) и в массиве их указывать не нужно.
 */
export type RichTextFeature =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'underline'
  | 'code'
  | 'highlight'
  | 'link'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'textAlign'
  | 'subscript'
  | 'superscript'
  | 'image'
  | 'table';

/**
 * Поле "richText" — форматированный текст (заголовки, списки, выделения и т.д.).
 *
 * Хранится как ProseMirror JSON в JSON-колонке (см. ADR 0001). Редактируется
 * в Studio через TipTap; на сайте может быть отрендерен любым обходчиком JSON.
 *
 * `features` — whitelist возможностей редактора. Не задано или пусто → дефолтный
 * минимум `['bold', 'italic']`.
 */
export type RichTextField = BaseFieldOptions & {
  type: 'richText';
  features?: RichTextFeature[];
};

/**
 * Значение поля `image` в документе.
 *
 * `assetId` — id строки в системной таблице `media_assets` (см. server). Сама
 * картинка хранится в S3-совместимом хранилище под ключом `media_assets.key`,
 * у строки в БД лежит метадата (имя, размер, размеры, sha1).
 *
 * `alt` опционален и хранится прямо в значении поля документа: одна и та же
 * картинка может иметь разные подписи в разных контекстах.
 */
export type ImageValue = {
  assetId: number;
  alt?: string;
};

/**
 * Расширенная форма image-значения, отдаваемая публичным REST API
 * (`@minecms/sdk` через `cms.<schema>.list/get`).
 *
 * `url` — готовая ссылка для подстановки в `<img src>`. Сервер сам решает:
 * если задан `S3_PUBLIC_URL` — публичная прямая ссылка, иначе временная
 * presigned-URL (TTL≈1ч). Кеширование на стороне клиента — стандартное HTTP.
 *
 * Сырая форма `ImageValue` остаётся канонической для БД и tRPC: Studio
 * сама подгружает viewUrl через `media.get`. Расширенная форма — это
 * исключительно публичный read-only контракт SDK.
 */
export type ImageAssetValue = {
  assetId: number;
  alt?: string;
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
};

/**
 * Поле "image" — ссылка на загруженный файл в `media_assets`.
 *
 * Хранится как JSON-колонка `{ assetId: number, alt?: string }` (см. ADR 0001).
 * Поле управляется через тот же CRUD `documents.*`; загрузка самих файлов —
 * через `POST /api/v1/media/upload` и tRPC `media.*`.
 */
export type ImageField = BaseFieldOptions & {
  type: 'image';
  /**
   * Ограничение по mime-типам (`image/png`, `image/jpeg`, …). Если не задано —
   * принимаются все image/* типы, поддерживаемые загрузчиком на сервере.
   */
  accept?: readonly string[];
};

/** Поле "slug" — URL-safe идентификатор (lowercase, цифры, `-`). */
export type SlugField = BaseFieldOptions & {
  type: 'slug';
  /** Имя поля, из которого автогенерится slug, если значение не указано. */
  source?: string;
  /** Должно ли значение быть уникальным в рамках схемы. По умолчанию `true`. */
  unique?: boolean;
  max?: number;
};

/** Поле "number" — целое или дробное число. */
export type NumberField = BaseFieldOptions & {
  type: 'number';
  /** Если `true`, значение должно быть целым. */
  integer?: boolean;
  min?: number;
  max?: number;
};

/** Поле "boolean" — true/false. */
export type BooleanField = BaseFieldOptions & {
  type: 'boolean';
  /** Значение по умолчанию для форм и БД. */
  default?: boolean;
};

/**
 * Скалярные поля без вложенных структур.
 *
 * Выделены отдельно, потому что в `array.of` и `object.fields` встречаются
 * вместе с `reference`/`object`/`union`, а в `defineSchema.fields` — со всеми типами.
 *
 * `image` тоже здесь — значение хранится как JSON, но семантически это «лист»:
 * нет произвольных вложенных подполей, как у `object`.
 */
export type ScalarFieldDefinition =
  | StringField
  | TextField
  | SlugField
  | NumberField
  | BooleanField
  | RichTextField
  | ImageField;

/**
 * Поле "reference" — ссылка на документ другой схемы.
 *
 * Хранится как id (целое число). Валидация существования цели выполняется
 * при `documents.create` / `update` на сервере (см. ADR 0001).
 */
export type ReferenceField = BaseFieldOptions & {
  type: 'reference';
  /** Имена допустимых целевых схем (из `defineConfig.schemas`). Хотя бы одна. */
  to: readonly string[];
};

/**
 * Поле "object" — вложенный объект с собственным набором полей.
 *
 * Хранится в JSON-колонке (см. ADR 0001). Может содержать любые типы полей,
 * включая `array` / `object` / `union` / `reference` (рекурсия).
 */
export type ObjectField = BaseFieldOptions & {
  type: 'object';
  fields: Record<string, FieldDefinition>;
};

/**
 * Поле "union" — дискриминируемый союз нескольких форм объекта.
 *
 * Каждый вариант — отдельный набор полей. При сериализации в значении
 * сохраняется поле-дискриминатор (по умолчанию `kind`) с ключом варианта.
 */
export type UnionField = BaseFieldOptions & {
  type: 'union';
  /** Имя поля-дискриминатора. По умолчанию `kind`. */
  discriminator?: string;
  /** Карта `<значение_дискриминатора>: ObjectField`. Минимум 2 варианта. */
  variants: Record<string, ObjectField>;
};

/**
 * Поле "array" — массив элементов одного типа `of`. Порядок сохраняется.
 *
 * Хранится в JSON-колонке (см. ADR 0001).
 */
export type ArrayField = BaseFieldOptions & {
  type: 'array';
  /** Тип одного элемента. */
  of: ScalarFieldDefinition | ReferenceField | ObjectField | UnionField;
  min?: number;
  max?: number;
};

/** Объединение всех известных типов полей. */
export type FieldDefinition =
  | ScalarFieldDefinition
  | ReferenceField
  | ObjectField
  | ArrayField
  | UnionField;

/**
 * Имя иконки из Hugeicons Free.
 *
 * Используется в `defineSchema({ icon })`, чтобы Studio могла отрисовать
 * иконку раздела в sidebar.
 */
export type SchemaIconName = Extract<
  keyof typeof import('@hugeicons/core-free-icons'),
  `${string}Icon`
>;

/**
 * Декларация схемы сущности — описание контент-модели.
 *
 * @typeParam F - Карта полей. Передаётся через `const`-параметр в `defineSchema`,
 *   чтобы сохранить литеральные типы для последующего вывода.
 */
export type SchemaDefinition<
  F extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
> = {
  /**
   * Технический идентификатор схемы: URL `/schema/…`, таблица БД, `input.schema` в tRPC.
   * Задаётся как `name` или как `type` в `defineSchema` (см. `defineSchema`).
   */
  name: string;
  /**
   * Дискриминатор типа записи: в API сериализуется в поле `type`;
   * если не задан — совпадает с `name`.
   */
  type?: string;
  /** Ровно один документ на эту схему: в Studio открывается сразу форма, без списка. */
  singleton?: boolean;
  /** Имя в множественном числе для URL и заголовков. По умолчанию — `${name}s`. */
  pluralName?: string;
  /** Человекочитаемое имя для UI Studio (ru). */
  label?: string;
  /** Иконка раздела в Studio sidebar (`Home01Icon`, `File01Icon` и т.д.). */
  icon?: SchemaIconName;
  /**
   * Порядок в fallback-режиме сайдбара (когда `studioStructure` не задан).
   */
  order?: number;
  /** Поля схемы. Ключ — имя поля в коде, значение — описание. */
  fields: F;
  /**
   * Имя поля, по которому идёт публичная маршрутизация документа.
   * Обычно `slug`. Если не указано — публичный route недоступен.
   */
  routeField?: keyof F;
  /**
   * Включить ли автоматические поля `createdAt` / `updatedAt`.
   * По умолчанию — `true`.
   */
  timestamps?: boolean;
};

/**
 * Скалярная часть `InferFieldValue`.
 *
 * `IShape` — тип значения для image-полей. По умолчанию — `ImageValue`
 * (как лежит в БД и приходит через tRPC). Через generic-параметр SDK
 * подсовывает расширенный `ImageAssetValue` для публичного REST.
 */
type InferScalarValue<F extends ScalarFieldDefinition, IShape = ImageValue> = F extends
  | StringField
  | TextField
  | SlugField
  ? string
  : F extends NumberField
    ? number
    : F extends BooleanField
      ? boolean
      : F extends RichTextField
        ? RichTextDoc
        : F extends ImageField
          ? IShape
          : never;

/** Тип значения поля на основе его описания (рекурсивно). */
export type InferFieldValue<
  F extends FieldDefinition,
  IShape = ImageValue,
> = F extends ScalarFieldDefinition
  ? InferScalarValue<F, IShape>
  : F extends ReferenceField
    ? number
    : F extends ObjectField
      ? InferObjectFields<F['fields'], IShape>
      : F extends ArrayField
        ? Array<InferFieldValue<F['of'], IShape>>
        : F extends UnionField
          ? InferUnionVariants<F, IShape>
          : never;

/** `optional: true` → значение поля может быть `null`. */
type InferWithOptional<F extends FieldDefinition, IShape = ImageValue> = F extends {
  optional: true;
}
  ? InferFieldValue<F, IShape> | null
  : InferFieldValue<F, IShape>;

/** Свернуть поля object-а в объект документа. */
type InferObjectFields<F extends Record<string, FieldDefinition>, IShape = ImageValue> = {
  [K in keyof F]: InferWithOptional<F[K], IShape>;
};

/** Имя дискриминатора union — заявленное в `defineField.union` или `'kind'`. */
type DiscriminatorOf<F extends UnionField> = F['discriminator'] extends string
  ? F['discriminator']
  : 'kind';

/** Объединение вариантов union: для каждого ключа — `{ [disc]: key, ...поля_варианта }`. */
type InferUnionVariants<F extends UnionField, IShape = ImageValue> = {
  [K in keyof F['variants']]: { [Disc in DiscriminatorOf<F>]: K & string } & InferObjectFields<
    F['variants'][K]['fields'],
    IShape
  >;
}[keyof F['variants']];

/**
 * Тип документа, выведенный из схемы.
 *
 * Для каждого поля:
 * - если `optional: true` → значение может быть `null`;
 * - иначе значение обязательно.
 *
 * @example
 * ```ts
 * const page = defineSchema({
 *   name: 'page',
 *   fields: {
 *     title: defineField.string({ label: 'Title' }),
 *     description: defineField.text({ label: 'Desc', optional: true }),
 *   },
 * });
 * type Page = InferSchemaType<typeof page>;
 * // { title: string; description: string | null }
 * ```
 */
export type InferSchemaType<S extends SchemaDefinition> = InferObjectFields<S['fields']>;

/**
 * Тип документа в публичном REST API (`@minecms/sdk`).
 *
 * Совпадает с `InferSchemaType<S>`, но `image`-поля приходят расширенными
 * (`ImageAssetValue` с `url/width/height/mimeType`) — клиенту не надо
 * делать N+1 запросы на media.
 */
export type InferSdkSchemaType<S extends SchemaDefinition> = InferObjectFields<
  S['fields'],
  ImageAssetValue
>;

/** Поддерживаемые драйверы БД. */
export type DatabaseDriver = 'mysql' | 'postgres';

/** Параметры подключения к БД. */
export type DatabaseConfig = {
  driver: DatabaseDriver;
  /**
   * Строка подключения. Если не указана — читается из переменной окружения
   * `DATABASE_URL` на стороне server.
   */
  url?: string;
};

/** Параметры HTTP-сервера. */
export type ServerConfig = {
  /** Порт для Fastify. По умолчанию `3333`. */
  port?: number;
  /** Origins для CORS — обычно Studio и публичные сайты. */
  cors?: string[];
};

/**
 * Элемент дерева второго сайдбара Studio (`items` в `studioStructure`).
 */
export type StudioStructureItem =
  | { kind: 'divider' }
  /** Ссылка на тип контента по `schema.name`. */
  | { kind: 'schema'; name: string };

/**
 * Группа пунктов навигации под одним заголовком (секция `studioStructure`).
 */
export type StudioStructurePane = {
  title: string;
  items: StudioStructureItem[];
};

/** Корневой конфиг приложения. */
export type ConfigDefinition = {
  database: DatabaseConfig;
  schemas: SchemaDefinition[];
  server?: ServerConfig;
  /**
   * Явная структура сайдбара контента. Если задана — в Studio показываются только
   * перечисленные типы; порядок и разделители задаются здесь, не в `defineSchema`.
   * Если нет — плоский список всех схем с сортировкой по `order`, заголовок по умолчанию.
   */
  studioStructure?: StudioStructurePane;
};
