import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Icon,
  Input,
} from '@minecms/ui';
import { Loader2, LogIn } from '@minecms/ui/icons';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { trpc } from '../../shared/api/client';

const PASSWORD_MIN = 8;

const loginSchema = z.object({
  email: z.string().email('Неверный формат e-mail.'),
  password: z.string().min(PASSWORD_MIN, `Минимум ${PASSWORD_MIN} символов.`),
});

/**
 * Форма входа на TanStack Form 1.x. Zod только на submit — сообщения не показываются
 * при фокусе/вводе до нажатия «Войти». Сабмит вызывает `auth.login` и редиректит на
 * `/dashboard` после инвалидации `auth.me`.
 */
export function LoginForm(): React.JSX.Element {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await navigate({ to: '/dashboard' });
    },
  });

  const form = useForm({
    defaultValues: { email: '', password: '' },
    canSubmitWhenInvalid: true,
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await login.mutateAsync(value);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field name="email">
          {(fieldApi) => {
            const error = firstErrorMessage(fieldApi.state.meta.errors);
            return (
              <Field data-invalid={error ? 'true' : undefined}>
                <FieldLabel htmlFor="login-email">E-mail</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={fieldApi.state.value}
                  onChange={(event) => fieldApi.handleChange(event.currentTarget.value)}
                  onBlur={fieldApi.handleBlur}
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="password">
          {(fieldApi) => {
            const error = firstErrorMessage(fieldApi.state.meta.errors);
            return (
              <Field data-invalid={error ? 'true' : undefined}>
                <FieldLabel htmlFor="login-password">Пароль</FieldLabel>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={fieldApi.state.value}
                  onChange={(event) => fieldApi.handleChange(event.currentTarget.value)}
                  onBlur={fieldApi.handleBlur}
                />
                {error ? (
                  <FieldError>{error}</FieldError>
                ) : (
                  <FieldDescription>Сессия живёт неделю на signed cookie.</FieldDescription>
                )}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      {login.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось войти</AlertTitle>
          <AlertDescription>{login.error.message}</AlertDescription>
        </Alert>
      )}

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit || isSubmitting || login.isPending}>
            {login.isPending || isSubmitting ? (
              <>
                <Icon icon={Loader2} className="animate-spin" /> Входим…
              </>
            ) : (
              <>
                <Icon icon={LogIn} /> Войти
              </>
            )}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

/**
 * TanStack Form 1.x кладёт в `meta.errors` объекты `StandardSchemaV1Issue`
 * (от Zod), а не строки. Достаём сообщение первой ошибки для отображения.
 */
function firstErrorMessage(errors: ReadonlyArray<unknown>): string | undefined {
  for (const issue of errors) {
    if (typeof issue === 'string') return issue;
    if (issue && typeof issue === 'object' && 'message' in issue) {
      const message = (issue as { message: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  }
  return undefined;
}
