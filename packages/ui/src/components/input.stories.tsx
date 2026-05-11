import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
};

export default meta;
type Story = StoryObj<typeof Input>;

export const InputDefault: Story = {
  name: 'Input',
  render: () => <Input>Input</Input>,
};
