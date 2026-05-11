import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@minecms/ui';
import { Stepper } from './stepper';

/**
 * Контейнер install-визарда: центрированная карточка со степпером сверху и слотом
 * для содержимого текущего шага.
 *
 * Рендерится в полноэкранной flex-обёртке с `bg-muted/50`, чтобы карточка
 * выделялась на фоне в light/dark одинаково.
 */
export interface InstallShellProps {
  steps: ReadonlyArray<{ key: string; label: string }>;
  current: number;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function InstallShell(props: InstallShellProps): React.JSX.Element {
  return (
    <div className="min-h-svh w-full bg-muted/40 px-4 py-12 sm:py-20">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">MineCMS</p>
          <h1 className="text-2xl font-semibold tracking-tight">Установка</h1>
          <p className="text-sm text-muted-foreground">
            Несколько шагов — и сервер готов отдавать ваш контент.
          </p>
        </header>

        <Card>
          <CardHeader className="gap-4">
            <Stepper steps={props.steps} current={props.current} />
            <div className="flex flex-col gap-1.5">
              <CardTitle>{props.title}</CardTitle>
              <CardDescription>{props.description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{props.children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
