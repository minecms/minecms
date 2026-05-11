import { HugeiconsIcon, type HugeiconsIconProps, type IconSvgElement } from '@hugeicons/react';
import { cn } from '../lib/cn';

export type { IconSvgElement } from '@hugeicons/react';
export type LucideIcon = IconSvgElement;

export interface IconProps extends Omit<HugeiconsIconProps, 'ref'> {
  /** Любая иконка-объект из `@minecms/ui/icons` (Hugeicons Free). */
  icon: IconSvgElement;
}

/**
 * Универсальная обёртка над иконками Hugeicons.
 *
 * Задаёт единый дефолтный размер `16` и `shrink-0`, чтобы иконки не растягивались
 * во flex-контейнерах. Цвет наследуется от `currentColor` — управляй через
 * `text-*` утилиты Tailwind.
 *
 * @example
 * ```tsx
 * import { Icon } from '@minecms/ui';
 * import { Plus } from '@minecms/ui/icons';
 *
 * <Icon icon={Plus} />
 * <Icon icon={Plus} size={20} className="text-primary" />
 * ```
 */
export function Icon({ icon: IconComp, className, size = 16, ...rest }: IconProps) {
  return (
    <HugeiconsIcon icon={IconComp} size={size} className={cn('shrink-0', className)} {...rest} />
  );
}
