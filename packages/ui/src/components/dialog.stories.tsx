import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const DialogDefault: Story = {
  name: 'Dialog',
  render: () => <Dialog>Dialog</Dialog>,
};

export const DialogTriggerDefault: Story = {
  name: 'DialogTrigger',
  render: () => <DialogTrigger>DialogTrigger</DialogTrigger>,
};

export const DialogCloseDefault: Story = {
  name: 'DialogClose',
  render: () => <DialogClose>DialogClose</DialogClose>,
};

export const DialogPortalDefault: Story = {
  name: 'DialogPortal',
  render: () => <DialogPortal>DialogPortal</DialogPortal>,
};

export const DialogOverlayDefault: Story = {
  name: 'DialogOverlay',
  render: () => <DialogOverlay>DialogOverlay</DialogOverlay>,
};

export const DialogContentDefault: Story = {
  name: 'DialogContent',
  render: () => <DialogContent>DialogContent</DialogContent>,
};

export const DialogHeaderDefault: Story = {
  name: 'DialogHeader',
  render: () => <DialogHeader>DialogHeader</DialogHeader>,
};

export const DialogFooterDefault: Story = {
  name: 'DialogFooter',
  render: () => <DialogFooter>DialogFooter</DialogFooter>,
};

export const DialogTitleDefault: Story = {
  name: 'DialogTitle',
  render: () => <DialogTitle>DialogTitle</DialogTitle>,
};

export const DialogDescriptionDefault: Story = {
  name: 'DialogDescription',
  render: () => <DialogDescription>DialogDescription</DialogDescription>,
};
