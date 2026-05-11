/// <reference types="vite/client" />
import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';
import '../src/styles/index.css';

/**
 * Глобальный preview-конфиг Storybook.
 *
 * - Подключает Tailwind v4 + tokens.css из `@minecms/ui`. Любая story рендерится
 *   ровно с теми же CSS-переменными, что Studio в production.
 * - Decorator `withThemeByClassName` переключает `.dark`/`.light` на `<html>` —
 *   тестируем оба режима без перезагрузки.
 * - Background и layout соответствуют тому, как компоненты живут в Studio:
 *   тёмный по умолчанию, центрированы.
 */
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
      expanded: true,
    },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'oklch(0.145 0 0)' },
        { name: 'card', value: 'oklch(0.205 0 0)' },
        { name: 'light', value: 'oklch(1 0 0)' },
      ],
    },
    layout: 'centered',
    a11y: {
      config: { rules: [{ id: 'color-contrast', enabled: true }] },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'dark',
    }),
  ],
  tags: ['autodocs'],
};

export default preview;
