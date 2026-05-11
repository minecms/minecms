import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

/**
 * Stories для группы `Select*`. Это композиционный компонент: используется
 * полным набором подкомпонентов одновременно. Контролируем `value` снаружи —
 * Storybook передаёт начальное значение, а handler меняет state.
 */
const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('en');
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Выберите язык" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ru">Русский</SelectItem>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="de">Deutsch</SelectItem>
        </SelectContent>
      </Select>
    );
  },
};

export const Grouped: Story = {
  render: () => {
    const [value, setValue] = useState('mysql');
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[260px]">
          <SelectValue placeholder="Выберите БД" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>SQL</SelectLabel>
            <SelectItem value="mysql">MySQL 8</SelectItem>
            <SelectItem value="postgres">PostgreSQL 16</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Embedded</SelectLabel>
            <SelectItem value="sqlite">SQLite</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <Select disabled value="en">
      <SelectTrigger className="w-[200px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  ),
};
