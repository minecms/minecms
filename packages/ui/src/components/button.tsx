import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'cursor-pointer transition-colors',
    'focus-visible:outline-none',
    'disabled:pointer-events-none disabled:cursor-not-allowed',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:hover:text-muted-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:hover:text-muted-foreground',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:border-border disabled:bg-muted/50 disabled:text-muted-foreground disabled:hover:bg-muted/50 disabled:hover:text-muted-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted disabled:hover:text-muted-foreground',
        ghost:
          'hover:bg-accent hover:text-accent-foreground disabled:bg-transparent disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
        link: 'text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline disabled:hover:text-muted-foreground disabled:hover:no-underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Если `true`, рендерит дочерний элемент с button-стилями (через Radix Slot). */
  asChild?: boolean;
}

/**
 * Базовая кнопка дизайн-системы MineCMS.
 *
 * Поддерживает 6 вариантов (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`)
 * и 4 размера (`default`, `sm`, `lg`, `icon`).
 *
 * `asChild` позволяет передать стили на любой child-элемент (например, `<a>`).
 */
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
