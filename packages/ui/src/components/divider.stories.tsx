import type { Meta, StoryObj } from '@storybook/react-vite';
import { Divider } from './divider';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Divider> = {
  title: 'Components/Divider',
  component: Divider,
};

export default meta;
type Story = StoryObj<typeof Divider>;

export const DividerDefault: Story = {
  name: 'Divider',
  render: () => <Divider>Divider</Divider>,
};
