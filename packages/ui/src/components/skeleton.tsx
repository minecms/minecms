import type * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Заглушка-скелетон для loading-состояний. Использует анимацию `animate-pulse`
 * Tailwind, цвет — `bg-muted` (наш токен).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
