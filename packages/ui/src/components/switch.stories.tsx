import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from './switch';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Switch> = {
  title: 'Components/Switch',
  component: Switch,
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const SwitchDefault: Story = {
  name: 'Switch',
  render: () => <Switch>Switch</Switch>,
};
