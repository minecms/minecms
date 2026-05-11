import type * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Стилизованная обёртка над `<form>` с дефолтным вертикальным layout.
 *
 * Не содержит логики — реальная работа с формами в Studio идёт через
 * TanStack Form + Zod-валидаторы из `@minecms/core`. Этот компонент
 * отвечает только за визуальную раскладку (gap между Field-ами).
 */
export function Form({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form data-slot="form" className={cn('flex flex-col gap-6', className)} {...props} />;
}
