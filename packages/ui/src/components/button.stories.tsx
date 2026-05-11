import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
};

export default meta;
type Story = StoryObj<typeof Button>;

export const ButtonDefault: Story = {
  name: 'Button',
  render: () => <Button>Button</Button>,
};
