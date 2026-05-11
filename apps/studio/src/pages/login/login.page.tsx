import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@minecms/ui';
import { LoginForm } from '../../features/auth-login/login-form';

/**
 * Страница входа: центрированная карточка с формой `auth.login`. Разметка
 * зеркалит install-page (тот же `min-h-svh` flex-контейнер) — ощущение единой
 * onboarding-зоны до попадания в shell-лейаут.
 */
export function LoginPage(): React.JSX.Element {
  return (
    <div className="min-h-svh w-full bg-muted/40 px-4 py-12 sm:py-20">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col gap-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">MineCMS</p>
          <h1 className="text-2xl font-semibold tracking-tight">Вход в Studio</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Учётные данные</CardTitle>
            <CardDescription>Используйте e-mail и пароль, заданные при установке.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
