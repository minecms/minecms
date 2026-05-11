import type { Meta, StoryObj } from '@storybook/react-vite';
import { Form } from './form';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Form> = {
  title: 'Components/Form',
  component: Form,
};

export default meta;
type Story = StoryObj<typeof Form>;

export const FormDefault: Story = {
  name: 'Form',
  render: () => <Form>Form</Form>,
};
