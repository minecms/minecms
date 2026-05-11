import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Объединяет classnames через clsx и разрешает конфликты Tailwind через tailwind-merge.
 *
 * @example
 * ```tsx
 * <button className={cn('px-2 py-1', isActive && 'bg-primary', className)} />
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
