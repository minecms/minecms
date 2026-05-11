import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert, AlertDescription, AlertTitle } from './alert';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const AlertDefault: Story = {
  name: 'Alert',
  render: () => <Alert>Alert</Alert>,
};

export const AlertTitleDefault: Story = {
  name: 'AlertTitle',
  render: () => <AlertTitle>AlertTitle</AlertTitle>,
};

export const AlertDescriptionDefault: Story = {
  name: 'AlertDescription',
  render: () => <AlertDescription>AlertDescription</AlertDescription>,
};
