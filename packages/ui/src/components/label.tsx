import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';
import { cn } from '../lib/cn';

export type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root>;

/**
 * Label для форм. Базируется на Radix Label — обеспечивает связь с input
 * по `htmlFor` и корректное поведение при клике.
 */
export function Label({ className, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
