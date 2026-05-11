# Поля схемы (`defineField`)

Все пользовательские поля описываются через фабрики **`defineField.*`** из `@minecms/core`. Studio и server используют один и тот же контракт после сериализации и сборки Zod-валидаторов.

## Скалярные типы

| Тип | Конструктор | Хранение / UI в Studio |
|-----|-------------|-------------------------|
| Короткая строка | `defineField.string({ label, min?, max?, pattern?, optional? })` | Однострочный input |
| Многострочный текст | `defineField.text({ label, min?, max?, optional? })` | Textarea |
| Slug | `defineField.slug({ label, source?, unique?, max?, optional? })` | Input + автогенерация из `source` |
| Число | `defineField.number({ label, integer?, min?, max?, optional? })` | `input type="number"` |
| Логическое | `defineField.boolean({ label, default?, optional? })` | Switch |
| Rich-text | `defineField.richText({ label, optional? })` | JSON (ProseMirror) — TipTap-редактор |

### Общие опции

- **`label`** (обязательно) — подпись в Studio, на русском.
- **`description`**, **`optional: true`** — подсказка и допуск `null` в документе.
- Для **`slug`**: **`source`** — имя поля-источника для автозаполнения; **`unique`** — уникальность в таблице схемы.

### Пример

```ts
fields: {
  title: defineField.string({ label: 'Заголовок', max: 200 }),
  excerpt: defineField.text({ label: 'Анонс', optional: true }),
  slug: defineField.slug({ label: 'Slug', source: 'title', unique: true }),
  sort: defineField.number({ label: 'Порядок', integer: true, min: 0, optional: true }),
  published: defineField.boolean({ label: 'Опубликовано', default: false }),
}
```

## Вложенные структуры (Phase 11)

| Тип | Конструктор | Хранение | UI в Studio |
|-----|-------------|----------|-------------|
| Объект | `defineField.object({ label, fields, optional? })` | JSON-колонка | Развёрнутый блок с подформой |
| Массив | `defineField.array({ label, of, min?, max?, optional? })` | JSON-колонка | Список с +Добавить, ↑↓, удалением |
| Союз вариантов | `defineField.union({ label, discriminator?, variants, optional? })` | JSON-колонка | Селектор типа + поля выбранного варианта |
| Ссылка на документ | `defineField.reference({ label, to, optional? })` | `bigint` (id) | Document picker |

См. также `minecms/docs/adr/0001-storage-of-nested-fields.md` — обоснование выбора JSON.

### `object` — вложенный объект

```ts
address: defineField.object({
  label: 'Адрес',
  fields: {
    city: defineField.string({ label: 'Город', max: 120 }),
    zip: defineField.string({ label: 'Индекс', max: 12, optional: true }),
  },
}),
```

### `array` — массив одного типа

`of` принимает любой тип поля: скаляр, `reference`, `object`, `union`. Для скаляров и
`reference` — массив значений; для `object`/`union` — массив объектов.

```ts
tags: defineField.array({
  label: 'Теги',
  of: defineField.string({ label: 'Тег' }),
  min: 1,
  max: 10,
}),
```

### `reference` — ссылка на документ

`to` — список допустимых имён схем (минимум одно). Сервер при `create`/`update`
проверяет, что документ-цель существует хотя бы в одной из этих схем; иначе
возвращает `BAD_REQUEST`.

```ts
author: defineField.reference({
  label: 'Автор',
  to: ['authors'],
}),
```

### `union` — дискриминируемый союз

Каждый вариант — `defineField.object({ label, fields })`. К объекту автоматически
добавляется поле-дискриминатор (по умолчанию `kind`). В `variants[<key>].fields`
запрещено объявлять поле с этим именем.

```ts
items: defineField.array({
  label: 'Пункты меню',
  of: defineField.union({
    label: 'Пункт',
    variants: {
      link: defineField.object({
        label: 'Внешняя ссылка',
        fields: {
          title: defineField.string({ label: 'Текст' }),
          url: defineField.string({ label: 'URL' }),
        },
      }),
      page: defineField.object({
        label: 'Страница сайта',
        fields: {
          ref: defineField.reference({ label: 'Страница', to: ['pages'] }),
        },
      }),
    },
  }),
}),
```

В JSON-документе значение варианта `link` будет, например:
`{ kind: 'link', title: 'О нас', url: '/about' }`.

## Rich-text (Phase 12)

`defineField.richText({ label, optional? })` — отдельный тип поля для длинного
форматированного текста. Хранение и тулинг:

- **БД:** JSON-колонка (`jsonb` в Postgres, `json` в MySQL) — как у `object`/`array`.
- **Формат:** ProseMirror JSON-документ (`{ type: 'doc', content: [...] }`),
  который генерирует TipTap-редактор с пресетом StarterKit (paragraph, heading 1–6,
  bullet/ordered list, listItem, blockquote, codeBlock, hardBreak, horizontalRule;
  marks: bold, italic, code, strike; история undo/redo).
- **Studio:** TipTap 3 в компоненте `RichTextInput` с панелью форматирования
  (`@minecms/ui` Button + иконки Hugeicons-обёртки `@minecms/ui/icons`).
- **SDK / сайт:** значение приходит как обычный JSON. Рендер на сайте — собственный
  обходчик JSON → JSX (см. `playground/demo/src/lib/rich-text.tsx`). Никакого
  `dangerouslySetInnerHTML` — whitelist узлов и mark'ов.

```ts
fields: {
  title: defineField.string({ label: 'Заголовок', max: 200 }),
  body: defineField.richText({ label: 'Контент', optional: true }),
}
```

Минимальный валидный документ:
`{ type: 'doc', content: [{ type: 'paragraph' }] }`.

## Как добавить новый тип поля в ядро

Изменения только в рамках пункта фазы в **`ROADMAP.md`**. Ориентировочная последовательность (все шаги с тестами и без полустабов):

1. **`packages/core/src/types.ts`** — описать тип поля (например `ImageField`) и включить в объединение `FieldDefinition`.
2. **`packages/core/src/field.ts`** — добавить фабрику `defineField.<newType>(...)`.
3. **`packages/core/src/validation.ts`** (и соседние модули) — перевод в Zod (`fieldToZod`), edge cases, optional/null.
4. **`apps/server/src/schemas/serialize.ts`** + `tables.ts` — сериализация в `SerializedField` для Studio и колонка БД.
5. **`apps/studio/src/entities/field-renderer/`** — `FieldInput`, при необходимости `FieldDisplay` для таблиц.
6. **Документация** — обновить этот файл и при необходимости [`schemas.md`](./schemas.md); юнит-тесты в `core` + smoke на server/studio по правилам фазы.

Без расширения locked-стека (новые npm-зависимости) вне пункта ROADMAP.

## Сериализация для Studio

Server не передаёт в Studio функции и `RegExp` как объекты: паттерны строковых полей при необходимости превращаются в строки. Типы полей в JSON формируют универсальный рендер форм. `union.variants` сериализуются в `{ label, description?, fields }`.

## См. также

- [`schemas.md`](./schemas.md) — полный путь от схемы до SDK.
- [`adr/0001-storage-of-nested-fields.md`](./adr/0001-storage-of-nested-fields.md) — почему JSON-колонка.
- `minecms/packages/core/src/field.test.ts`, `validation.test.ts` — примеры контрактов.
