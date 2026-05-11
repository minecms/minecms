# ADR 0001 — Хранение вложенных полей (object / array / union / reference)

Статус: принят (Phase 11). Дата: 2026-05.

## Контекст

В Phase 11 в `@minecms/core` появляются новые типы полей для удобного редактирования списков и навигации:

- `defineField.object({ fields })` — вложенный объект.
- `defineField.array({ of })` — массив элементов одного типа (скаляр, объект, union, reference).
- `defineField.union({ discriminator, variants })` — дискриминируемый союз нескольких форм объекта (для пунктов меню «ссылка / страница / группа»).
- `defineField.reference({ to })` — ссылка на документ другой схемы.

Стек закрытый: MySQL 8 (тип `JSON`), PostgreSQL 16 (`jsonb`). Drizzle покрывает оба.

Возможные стратегии хранения:

1. **JSON-колонка** — единый JSON на корневое поле документа.
2. **Нормализованные таблицы** — для каждого `array` отдельная таблица `parent_id, position, kind, …`; `reference` как настоящий FK.
3. **Гибрид** — `object`/`array` в JSON; `reference` через отдельную join-таблицу с FK для целостности и быстрых join.

## Решение

Для `object`/`array`/`union` — **JSON-колонка** (`JSON` в MySQL, `jsonb` в Postgres).
Для `reference` — **id колонка** (`bigint unsigned` в MySQL, `bigint` в Postgres) с **runtime-валидацией существования** документа целевой схемы из списка `to` (без БД-FK на текущей итерации).

## Почему

- Совместимость с обоими драйверами достигается одним кодом.
- Нет необходимости генерировать N дополнительных таблиц на каждый `array`/вложенный `object` и поддерживать миграции их колонок при изменении формы вложенных полей.
- Read API остаётся одним `SELECT` без `JOIN`. Это упрощает REST `/api/v1/:schema` и SDK.
- Для contentful-задач (меню сайта, секции главной, FAQ-список, тегирование) скорость доступа достаточна; индексы по дочерним полям не нужны на старте.
- `reference` хранится как обычный id в скалярной колонке (или внутри JSON, если поле находится внутри `array`/`object`); валидация — на стороне приложения.

## Что мы сознательно теряем

- **БД-целостность ссылок (FK).** Удалили целевой документ — сломанная ссылка. Закрывается soft-delete и/или валидацией при чтении (Phase 12+).
- **SQL-индексы по дочерним полям.** Нельзя сделать `WHERE meta->>'tag' = 'x'` быстро. Решается отдельной фазой нормализации, если возникнет потребность.
- **Партиальный update вложенных элементов.** Любая правка массива заменяет всё значение поля. Конкурентные правки одного списка из двух вкладок Studio могут потерять элемент (последний writer wins). Это приемлемо на текущем этапе; в будущем — оптимистическая блокировка по `updated_at`.

## Эволюция

Если через прод-нагрузку выяснится, что нужны индексированные join (большие списки тегов, поиск по reference и т.п.) — переход на гибрид:
- Оставить JSON для остальных вложенных структур.
- Переписать `reference` (и/или `array of reference`) на отдельную join-таблицу с FK.
- Это не ломает публичный API `defineField`, а только изменяет рантайм-сторону.

## Конкретика реализации

| Часть | Что делает |
|---|---|
| `@minecms/core` | Новые типы `ObjectField` / `ArrayField` / `UnionField` / `ReferenceField`; `defineField.object/array/union/reference`; рекурсивный `InferSchemaType`; `fieldToZod` рекурсивно строит Zod (`z.object`, `z.array`, `z.discriminatedUnion`). |
| `apps/server/src/schemas/tables.ts` | Колонка-родитель: `JSON`/`jsonb` для `object`/`array`/`union`; `bigint` (mysql/pg) для `reference`. |
| `apps/server/src/trpc/routers/documents.ts` | После Zod-валидации — проверка целевых документов всех `reference` в дереве; `NOT_FOUND` если документ не найден. |
| `apps/server/src/schemas/serialize.ts` | Рекурсивный `SerializedField` (включая `object.fields`, `array.of`, `union.variants`, `reference.to`). |
| Studio `entities/field-renderer` | `FieldInput` поддерживает `object` (вложенная форма), `array` (add / remove / order, аккордеон), `union` (выбор варианта при добавлении), `reference` (document picker). |
