# @minecms/ui

Дизайн-система MineCMS — токены (oklch), Tailwind v4 preset и React-примитивы.

## Палитра

- **База и акцент:** Zinc (реестр shadcn/ui theme «zinc», oklch)
- **Радиус:** `0.375rem` (6px) — продуктовый дефолт MineCMS
- **Темы:** light + dark, переключаются классом `.dark` на корне; по умолчанию `prefers-color-scheme`.

## Подключение в приложении

```css
/* main.css */
@import '@minecms/ui/styles.css';
```

Один импорт подключит Tailwind v4, токены и `@theme inline` маппинг — после этого работают утилиты `bg-background`, `text-foreground`, `bg-primary`, `border`, `ring-ring` и т.п.

## Компоненты

Минимальный набор Phase 3:

- **Базовые:** `Button`, `Input`, `Textarea`, `Label`, `Icon`
- **Контейнеры:** `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`
- **Формы:** `Form`, `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError`
- **Уведомления:** `Alert`, `AlertTitle`, `AlertDescription`
- **Селект:** `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (на Radix UI)
- **Утилита:** `cn(...)` — slx + tailwind-merge

## Иконки

Только Hugeicons через обёртку:

```tsx
import { Icon } from '@minecms/ui';
import { Plus } from '@minecms/ui/icons';

<Icon icon={Plus} size={20} />;
```

## Использование форм (паттерн shadcn 2026)

```tsx
import { Field, FieldDescription, FieldGroup, FieldLabel, Form, Input } from '@minecms/ui';

<Form onSubmit={handleSubmit}>
  <FieldGroup>
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input id="email" type="email" />
      <FieldDescription>Не публикуется.</FieldDescription>
    </Field>
  </FieldGroup>
</Form>;
```

## Стадия

Phase 3 ROADMAP — фиксированный минимум. Новые компоненты (Dialog, Sheet, Dropdown, Tabs, Toast) добавляются отдельными фазами по мере появления `[ ]` пунктов.
