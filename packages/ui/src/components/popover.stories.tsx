import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Popover> = {
  title: 'Components/Popover',
  component: Popover,
};

export default meta;
type Story = StoryObj<typeof Popover>;

export const PopoverDefault: Story = {
  name: 'Popover',
  render: () => <Popover>Popover</Popover>,
};

export const PopoverTriggerDefault: Story = {
  name: 'PopoverTrigger',
  render: () => <PopoverTrigger>PopoverTrigger</PopoverTrigger>,
};

export const PopoverAnchorDefault: Story = {
  name: 'PopoverAnchor',
  render: () => <PopoverAnchor>PopoverAnchor</PopoverAnchor>,
};

export const PopoverContentDefault: Story = {
  name: 'PopoverContent',
  render: () => <PopoverContent>PopoverContent</PopoverContent>,
};
