import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Label> = {
  title: 'Components/Label',
  component: Label,
};

export default meta;
type Story = StoryObj<typeof Label>;

export const LabelDefault: Story = {
  name: 'Label',
  render: () => <Label>Label</Label>,
};
