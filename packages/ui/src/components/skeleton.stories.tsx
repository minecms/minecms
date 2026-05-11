import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const SkeletonDefault: Story = {
  name: 'Skeleton',
  render: () => <Skeleton>Skeleton</Skeleton>,
};
