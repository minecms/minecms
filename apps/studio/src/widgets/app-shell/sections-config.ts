import type { LucideIcon } from '@minecms/ui';
import { Gauge, ImageIcon, LayoutDashboard, Trash2 } from '@minecms/ui/icons';

/**
 * Конвенция playground: singleton навигации в `studioStructure`, без отдельной кнопки в левом рельсе.
 * Используется только чтобы точка входа «Контент» вела на первую «контентную» схему, а не на `navigation`.
 */
export const NAVIGATION_SCHEMA_NAME = 'navigation' as const;

export type AppSectionId = 'home' | 'content' | 'media' | 'trash';
export type AppSectionSidebarKind = 'none' | 'content';

/**
 * RU-подпись раздела контента: левый рельс (`title`) и заголовок второй колонки,
 * если в конфиге нет `studioStructure` (тогда берётся `studioStructure.title`).
 */
export const STUDIO_CONTENT_SECTION_LABEL = 'Контент';

export interface AppSection {
  id: AppSectionId;
  label: string;
  icon: LucideIcon;
  sidebar: AppSectionSidebarKind;
  isActive: (pathname: string) => boolean;
}

/**
 * Единый конфиг разделов Studio.
 *
 * Добавление нового раздела = добавить запись сюда и (при необходимости)
 * подключить отдельный sidebar-компонент в `AppShell`.
 */
export const APP_SECTIONS: readonly AppSection[] = [
  {
    id: 'home',
    label: 'Дашборд',
    icon: Gauge,
    sidebar: 'none',
    isActive: (pathname) => pathname.startsWith('/dashboard'),
  },
  {
    id: 'content',
    label: STUDIO_CONTENT_SECTION_LABEL,
    icon: LayoutDashboard,
    sidebar: 'content',
    isActive: (pathname) => pathname.startsWith('/schema/'),
  },
  {
    id: 'media',
    label: 'Медиа',
    icon: ImageIcon,
    sidebar: 'none',
    isActive: (pathname) => pathname.startsWith('/media'),
  },
  {
    id: 'trash',
    label: 'Корзина',
    icon: Trash2,
    sidebar: 'none',
    isActive: (pathname) => pathname.startsWith('/trash'),
  },
] as const;

export function resolveActiveSection(pathname: string): AppSection {
  return APP_SECTIONS.find((section) => section.isActive(pathname)) ?? APP_SECTIONS[0]!;
}
