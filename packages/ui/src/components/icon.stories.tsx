import type { Meta, StoryObj } from '@storybook/react-vite';
import { Boxes, FileText, LayoutDashboard, LogIn, LogOut, Settings } from '../../src/icons';
import { Icon } from './icon';

/**
 * Stories для `<Icon />`. Иконки приходят как value-prop из `@minecms/ui/icons`
 * (re-export Hugeicons). Не строкой — только лексический импорт. Это правило
 * проекта: см. `.cursor/rules/fsd-frontend.mdc`.
 */
const meta: Meta<typeof Icon> = {
  title: 'Components/Icon',
  component: Icon,
  argTypes: {
    icon: { control: false },
    className: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Icon>;

export const Default: Story = {
  args: { icon: LayoutDashboard, className: 'size-5 text-foreground' },
};

export const Muted: Story = {
  args: { icon: FileText, className: 'size-4 text-muted-foreground' },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3 text-foreground">
      <Icon icon={Boxes} className="size-3" />
      <Icon icon={Boxes} className="size-4" />
      <Icon icon={Boxes} className="size-5" />
      <Icon icon={Boxes} className="size-6" />
      <Icon icon={Boxes} className="size-8" />
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm text-foreground">
      <span className="inline-flex items-center gap-2">
        <Icon icon={Settings} className="size-4 text-muted-foreground" /> Настройки
      </span>
      <span className="inline-flex items-center gap-2">
        <Icon icon={LogIn} className="size-4 text-primary" /> Войти
      </span>
      <span className="inline-flex items-center gap-2">
        <Icon icon={LogOut} className="size-4 text-destructive" /> Выйти
      </span>
    </div>
  ),
};
