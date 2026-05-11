import type * as React from 'react';
import { cn } from '../lib/cn';
import { Label } from './label';

/**
 * Form Field composition (shadcn 2026 pattern).
 *
 * `FieldGroup` — вертикальный стек из нескольких `Field`.
 * `Field` — одна строка формы: `FieldLabel` + control (`Input`/`Textarea`/`Select`) +
 *   опциональные `FieldDescription` и `FieldError`.
 *
 * @example
 * ```tsx
 * <FieldGroup>
 *   <Field>
 *     <FieldLabel htmlFor="email">Email</FieldLabel>
 *     <Input id="email" type="email" />
 *     <FieldDescription>Не публикуется.</FieldDescription>
 *   </Field>
 *   <Field>
 *     <FieldLabel htmlFor="pwd">Пароль</FieldLabel>
 *     <Input id="pwd" type="password" aria-invalid />
 *     <FieldError>Слишком короткий</FieldError>
 *   </Field>
 * </FieldGroup>
 * ```
 */
export function FieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="field-group" className={cn('flex flex-col gap-4', className)} {...props} />
  );
}

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="field" className={cn('flex flex-col gap-2', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    />
  );
}
