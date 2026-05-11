import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const CardDefault: Story = {
  name: 'Card',
  render: () => <Card>Card</Card>,
};

export const CardHeaderDefault: Story = {
  name: 'CardHeader',
  render: () => <CardHeader>CardHeader</CardHeader>,
};

export const CardTitleDefault: Story = {
  name: 'CardTitle',
  render: () => <CardTitle>CardTitle</CardTitle>,
};

export const CardDescriptionDefault: Story = {
  name: 'CardDescription',
  render: () => <CardDescription>CardDescription</CardDescription>,
};

export const CardContentDefault: Story = {
  name: 'CardContent',
  render: () => <CardContent>CardContent</CardContent>,
};

export const CardFooterDefault: Story = {
  name: 'CardFooter',
  render: () => <CardFooter>CardFooter</CardFooter>,
};
