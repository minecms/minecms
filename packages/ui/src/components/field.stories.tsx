import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './field';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof FieldGroup> = {
  title: 'Components/Field',
  component: FieldGroup,
};

export default meta;
type Story = StoryObj<typeof FieldGroup>;

export const FieldGroupDefault: Story = {
  name: 'FieldGroup',
  render: () => <FieldGroup>FieldGroup</FieldGroup>,
};

export const FieldDefault: Story = {
  name: 'Field',
  render: () => <Field>Field</Field>,
};

export const FieldLabelDefault: Story = {
  name: 'FieldLabel',
  render: () => <FieldLabel>FieldLabel</FieldLabel>,
};

export const FieldDescriptionDefault: Story = {
  name: 'FieldDescription',
  render: () => <FieldDescription>FieldDescription</FieldDescription>,
};

export const FieldErrorDefault: Story = {
  name: 'FieldError',
  render: () => <FieldError>FieldError</FieldError>,
};
