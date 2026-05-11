import { cn } from '@minecms/ui';

/**
 * Маленький линейный stepper для install-визарда. Показывает три шага горизонтально,
 * подсвечивает текущий и пройденные.
 *
 * Намеренно минимальный — install-визард проходится один раз, любой более тяжёлый
 * компонент тут лишний.
 */
export interface StepperProps {
  steps: ReadonlyArray<{ key: string; label: string }>;
  current: number;
}

export function Stepper(props: StepperProps): React.JSX.Element {
  return (
    <ol className="flex w-full items-center gap-2 text-sm">
      {props.steps.map((step, idx) => {
        const isDone = idx < props.current;
        const isActive = idx === props.current;
        return (
          <li
            key={step.key}
            className="flex flex-1 items-center gap-2"
            aria-current={isActive ? 'step' : undefined}
          >
            <span
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                isDone && 'border-primary bg-primary text-primary-foreground',
                isActive && 'border-primary text-primary',
                !isDone && !isActive && 'border-border text-muted-foreground',
              )}
            >
              {idx + 1}
            </span>
            <span
              className={cn(
                'truncate',
                isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
            {idx < props.steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('h-px flex-1', isDone ? 'bg-primary' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
