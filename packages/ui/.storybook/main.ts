import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10 + Vite для `@minecms/ui`.
 *
 * - `stories` ловит и рукописные `*.stories.tsx`, и `auto.stories.tsx`
 *   (см. `src/.storybook-auto/auto.stories.tsx`), который автоматически
 *   создаёт story для каждого компонента из `src/components/*.tsx` — даже
 *   если разработчик забыл написать свою.
 * - Vite-конфиг пакета (`vite.config.ts`) подтягивается автоматически:
 *   Tailwind v4 plugin даёт preview точно те же утилиты, что и Studio.
 *
 * Имена пакетов в `framework`/`addons` указаны строкой — Storybook 10
 * сам резолвит их через стандартный node_modules lookup. Никаких
 * `require.resolve` в ESM-конфиге.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/.storybook-auto/auto.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-themes', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
};

export default config;
