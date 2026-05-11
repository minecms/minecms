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
import { ArrowLeft, ArrowRight, Loader2 } from '@minecms/ui/icons';
import { useState } from 'react';
import { z } from 'zod';
import { trpc } from '../../shared/api/client';
import type { DatabaseChoice } from '../install-database/database-step';

const PASSWORD_MIN = 8;

const adminSchema = z
  .object({
    email: z.string().email('Неверный формат e-mail.'),
    password: z.string().min(PASSWORD_MIN, `Минимум ${PASSWORD_MIN} символов.`),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: 'Пароли не совпадают.',
    path: ['confirmation'],
  });

interface AdminFormValues {
  email: string;
  password: string;
  confirmation: string;
}

type FieldErrors = Partial<Record<keyof AdminFormValues, string>>;

export interface AdminStepProps {
  database: DatabaseChoice;
  onBack: () => void;
  onSuccess: () => void;
}

/**
 * Второй шаг визарда: e-mail и пароль администратора. На submit вызывает
 * `install.run` с предыдущим выбором БД из шага 1, после успеха — `onSuccess`.
 */
export function AdminStep(props: AdminStepProps): React.JSX.Element {
  const [values, setValues] = useState<AdminFormValues>({
    email: '',
    password: '',
    confirmation: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const installRun = trpc.install.run.useMutation();

  function handleChange<K extends keyof AdminFormValues>(field: K, value: string): void {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    installRun.reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = adminSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          typeof key === 'string' &&
          (key === 'email' || key === 'password' || key === 'confirmation')
        ) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    installRun.mutate(
      {
        driver: props.database.driver,
        url: props.database.url,
        installToken: props.database.installToken,
        admin: { email: parsed.data.email, password: parsed.data.password },
      },
      {
        onSuccess: () => props.onSuccess(),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.email ? 'true' : undefined}>
          <FieldLabel htmlFor="admin-email">E-mail администратора</FieldLabel>
          <Input
            id="admin-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => handleChange('email', event.currentTarget.value)}
            required
          />
          {errors.email ? (
            <FieldError>{errors.email}</FieldError>
          ) : (
            <FieldDescription>
              На этот адрес будет привязан первый и единственный аккаунт с ролью admin.
            </FieldDescription>
          )}
        </Field>

        <Field data-invalid={errors.password ? 'true' : undefined}>
          <FieldLabel htmlFor="admin-password">Пароль</FieldLabel>
          <Input
            id="admin-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => handleChange('password', event.currentTarget.value)}
            minLength={PASSWORD_MIN}
            required
          />
          {errors.password ? (
            <FieldError>{errors.password}</FieldError>
          ) : (
            <FieldDescription>Минимум {PASSWORD_MIN} символов.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={errors.confirmation ? 'true' : undefined}>
          <FieldLabel htmlFor="admin-confirmation">Подтверждение пароля</FieldLabel>
          <Input
            id="admin-confirmation"
            type="password"
            autoComplete="new-password"
            value={values.confirmation}
            onChange={(event) => handleChange('confirmation', event.currentTarget.value)}
            required
          />
          {errors.confirmation && <FieldError>{errors.confirmation}</FieldError>}
        </Field>
      </FieldGroup>

      {installRun.isError && (
        <Alert variant="destructive">
          <AlertTitle>Установка не завершилась</AlertTitle>
          <AlertDescription>{installRun.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={props.onBack}
          disabled={installRun.isPending}
        >
          <Icon icon={ArrowLeft} /> Назад
        </Button>
        <Button type="submit" disabled={installRun.isPending}>
          {installRun.isPending ? (
            <>
              <Icon icon={Loader2} className="animate-spin" /> Устанавливаем…
            </>
          ) : (
            <>
              Установить
              <Icon icon={ArrowRight} />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
