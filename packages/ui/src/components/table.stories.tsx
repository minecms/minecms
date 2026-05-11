import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

/**
 * Stories автогенерированы скриптом `storybook:scaffold`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — `storybook:check` упадёт.
 */
const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
};

export default meta;
type Story = StoryObj<typeof Table>;

export const TableDefault: Story = {
  name: 'Table',
  render: () => <Table>Table</Table>,
};

export const TableHeaderDefault: Story = {
  name: 'TableHeader',
  render: () => <TableHeader>TableHeader</TableHeader>,
};

export const TableBodyDefault: Story = {
  name: 'TableBody',
  render: () => <TableBody>TableBody</TableBody>,
};

export const TableFooterDefault: Story = {
  name: 'TableFooter',
  render: () => <TableFooter>TableFooter</TableFooter>,
};

export const TableRowDefault: Story = {
  name: 'TableRow',
  render: () => <TableRow>TableRow</TableRow>,
};

export const TableHeadDefault: Story = {
  name: 'TableHead',
  render: () => <TableHead>TableHead</TableHead>,
};

export const TableCellDefault: Story = {
  name: 'TableCell',
  render: () => <TableCell>TableCell</TableCell>,
};
