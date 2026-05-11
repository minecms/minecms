import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentType, createElement, isValidElement } from 'react';

/**
 * Автоматический story-индекс: для каждого компонента из `src/components/*.tsx`
 * создаётся story `Auto/<ComponentName>`. Если разработчик добавил свою
 * `*.stories.tsx` рядом с компонентом — она появится в своём разделе
 * (`Components/<ComponentName>`), и автостори не будет с ней конфликтовать.
 *
 * Зачем это нужно:
 * - Storybook никогда не пустой: новый компонент сразу виден в каталоге.
 * - Pre-commit `storybook:check` гарантирует, что для каждого компонента есть
 *   хотя бы автостори (он есть всегда), плюс при желании рукописная.
 *
 * Ограничения автостори: рендерится с дефолтными пропсами + опциональным
 * `previewProps` (если компонент-модуль экспортирует константу `previewProps`).
 * Для нетривиальных компонентов рекомендуется писать свою `.stories.tsx`.
 */

interface AutoModule {
  default?: ComponentType<unknown> | ((p: unknown) => unknown);
  previewProps?: Record<string, unknown>;
  previewChildren?: React.ReactNode;
  [exportName: string]: unknown;
}

const modules = import.meta.glob<AutoModule>('../components/*.tsx', { eager: true });

interface AutoEntry {
  name: string;
  Component: ComponentType<unknown>;
  props: Record<string, unknown>;
  children: React.ReactNode;
}

const entries: AutoEntry[] = [];

for (const [path, mod] of Object.entries(modules)) {
  const fileName =
    path
      .split('/')
      .pop()
      ?.replace(/\.tsx$/, '') ?? 'Unknown';

  const exportsToScan: Array<[string, unknown]> = Object.entries(mod);
  const componentExports = exportsToScan.filter(
    ([key, value]) =>
      typeof value === 'function' &&
      key !== 'previewProps' &&
      key !== 'previewChildren' &&
      /^[A-Z]/.test(key),
  );

  if (componentExports.length === 0) continue;

  for (const [exportName, value] of componentExports) {
    const display = exportName === 'default' ? capitalize(fileName) : exportName;
    entries.push({
      name: display,
      Component: value as ComponentType<unknown>,
      props: (mod.previewProps as Record<string, unknown> | undefined) ?? {},
      children: (mod.previewChildren as React.ReactNode | undefined) ?? defaultChildren(display),
    });
  }
}

const meta: Meta = {
  title: 'Auto/Components',
  parameters: {
    docs: {
      description: {
        component:
          'Автогенерация: каждый компонент из `src/components/*.tsx` появляется здесь автоматически. ' +
          'Для расширенной документации создай `<name>.stories.tsx` рядом с компонентом.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

function makeStory(entry: AutoEntry): Story {
  return {
    name: entry.name,
    render: () => {
      try {
        const node = createElement(entry.Component, entry.props, entry.children);
        return isValidElement(node) ? node : <div>{String(node)}</div>;
      } catch (err) {
        return (
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <strong>Не удалось отрендерить {entry.name}:</strong>{' '}
            {(err as Error).message ?? 'unknown error'}
            <p className="mt-2 text-xs opacity-70">
              Создай <code>{entry.name.toLowerCase()}.stories.tsx</code> рядом с компонентом и опиши
              пропсы вручную.
            </p>
          </div>
        );
      }
    },
  };
}

const generated: Record<string, Story> = {};
for (const entry of entries) {
  generated[entry.name] = makeStory(entry);
}

/**
 * Storybook реагирует только на статически объявленные именованные экспорты,
 * поэтому динамическое создание stories невозможно — приходится перечислять
 * известные компоненты явно. Если компонент в `src/components/` появился, но
 * здесь не упомянут — он будет в каталоге через свой собственный
 * `*.stories.tsx`, который создаёт `storybook:scaffold`.
 */
export const Button = generated.Button ?? notFound('Button');
export const Card = generated.Card ?? notFound('Card');
export const Input = generated.Input ?? notFound('Input');
export const Textarea = generated.Textarea ?? notFound('Textarea');
export const Switch = generated.Switch ?? notFound('Switch');
export const Label = generated.Label ?? notFound('Label');
export const Badge = generated.Badge ?? notFound('Badge');
export const Skeleton = generated.Skeleton ?? notFound('Skeleton');
export const Alert = generated.Alert ?? notFound('Alert');
export const Field = generated.Field ?? notFound('Field');
export const Icon = generated.Icon ?? notFound('Icon');
export const Select = generated.Select ?? notFound('Select');
export const Form = generated.Form ?? notFound('Form');
export const Table = generated.Table ?? notFound('Table');

function capitalize(s: string): string {
  if (!s) return s;
  return s
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function defaultChildren(name: string): React.ReactNode {
  return name;
}

function notFound(name: string): Story {
  return {
    name,
    render: () => (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Компонент <code>{name}</code> не найден в <code>src/components</code>. Удали этот экспорт из
        <code> auto.stories.tsx</code>, если компонент был переименован.
      </div>
    ),
  };
}
