import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const BadgeDefault: Story = {
  name: 'Badge',
  render: () => <Badge>Badge</Badge>,
};
