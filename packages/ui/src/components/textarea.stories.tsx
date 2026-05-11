import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from './textarea';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const TextareaDefault: Story = {
  name: 'Textarea',
  render: () => <Textarea>Textarea</Textarea>,
};
