import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  cn,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Icon,
  Input,
} from '@minecms/ui';
import { ArrowRight, CheckCircle2, Database, Loader2 } from '@minecms/ui/icons';
import { useState } from 'react';
import { trpc } from '../../shared/api/client';

const DEFAULT_URLS = {
  mysql: 'mysql://minecms:minecms@127.0.0.1:3306/minecms',
  postgres: 'postgres://minecms:minecms@127.0.0.1:5432/minecms',
} as const;

const INSTALL_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Снимок выбранной БД и одноразового токена, передаётся в шаг 2 для `install.run`. */
export interface DatabaseChoice {
  driver: 'mysql' | 'postgres';
  url: string;
  installToken: string;
}

export interface DatabaseStepProps {
  initial?: DatabaseChoice;
  onNext: (choice: DatabaseChoice) => void;
}

/**
 * Первый шаг визарда: выбор драйвера + строка подключения + ручная проверка.
 *
 * Кнопка «Дальше» открыта всегда (визард — sandbox; пользователь сам решает,
 * нужно ли проверить заранее), но «Проверить» вызывает `install.testDatabase` и
 * показывает результат. Это типичный паттерн install-флоу — не блокировать,
 * но дать обратную связь.
 */
export function DatabaseStep(props: DatabaseStepProps): React.JSX.Element {
  const [driver, setDriver] = useState<'mysql' | 'postgres'>(props.initial?.driver ?? 'mysql');
  const [url, setUrl] = useState<string>(props.initial?.url ?? DEFAULT_URLS.mysql);
  const [installToken, setInstallToken] = useState<string>(props.initial?.installToken ?? '');

  const testDatabase = trpc.install.testDatabase.useMutation();

  const trimmedToken = installToken.trim().toLowerCase();
  const tokenValid = INSTALL_TOKEN_PATTERN.test(trimmedToken);
  const canSubmit = Boolean(url.trim()) && tokenValid;

  function selectDriver(next: 'mysql' | 'postgres'): void {
    setDriver(next);
    if (url === DEFAULT_URLS.mysql || url === DEFAULT_URLS.postgres) {
      setUrl(DEFAULT_URLS[next]);
    }
    testDatabase.reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) return;
    props.onNext({ driver, url: url.trim(), installToken: trimmedToken });
  }

  function handleTest(): void {
    if (!url.trim() || !tokenValid) return;
    testDatabase.mutate({ driver, url: url.trim(), installToken: trimmedToken });
  }

  const result = testDatabase.data;
  const showSuccess = !testDatabase.isPending && result?.ok === true;
  const showFailure =
    !testDatabase.isPending && (testDatabase.isError || (result && result.ok === false));
  const failureMessage = testDatabase.isError
    ? testDatabase.error.message
    : result && result.ok === false
      ? result.error
      : '';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel>Драйвер базы данных</FieldLabel>
          <FieldDescription>
            Можно подключить MySQL 8 (по умолчанию) или PostgreSQL 16. Структура схем зеркальная.
          </FieldDescription>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
            <DriverOption
              value="mysql"
              checked={driver === 'mysql'}
              onSelect={selectDriver}
              label="MySQL 8"
              hint="По умолчанию"
            />
            <DriverOption
              value="postgres"
              checked={driver === 'postgres'}
              onSelect={selectDriver}
              label="PostgreSQL 16"
              hint="Альтернатива"
            />
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="db-url">Строка подключения</FieldLabel>
          <Input
            id="db-url"
            value={url}
            placeholder={DEFAULT_URLS[driver]}
            onChange={(event) => {
              setUrl(event.currentTarget.value);
              testDatabase.reset();
            }}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <FieldDescription>
            Стандартный URL вида <code>{driver}://user:pass@host:port/dbname</code>. На локальной
            машине обычно подходит дефолтный {DEFAULT_URLS[driver]}.
          </FieldDescription>
        </Field>

        <Field data-invalid={installToken && !tokenValid ? 'true' : undefined}>
          <FieldLabel htmlFor="install-token">Install-token</FieldLabel>
          <Input
            id="install-token"
            value={installToken}
            placeholder="64-символьная hex-строка из вывода сервера"
            onChange={(event) => {
              setInstallToken(event.currentTarget.value);
              testDatabase.reset();
            }}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <FieldDescription>
            Сервер при первом старте печатает токен в stdout:{' '}
            <code>MINECMS · первая установка</code>. Скопируй его сюда — после успешной установки
            токен будет удалён автоматически.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {showSuccess && (
        <Alert>
          <AlertTitle>Подключение работает</AlertTitle>
          <AlertDescription>
            Сервер открыл соединение и выполнил <code>SELECT 1</code>. Можно идти дальше.
          </AlertDescription>
        </Alert>
      )}

      {showFailure && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось подключиться</AlertTitle>
          <AlertDescription>{failureMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={testDatabase.isPending || !url.trim() || !tokenValid}
        >
          {testDatabase.isPending ? (
            <>
              <Icon icon={Loader2} className="animate-spin" /> Проверяем…
            </>
          ) : (
            <>
              <Icon icon={Database} /> Проверить подключение
            </>
          )}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          Дальше
          <Icon icon={ArrowRight} />
        </Button>
      </div>
    </form>
  );
}

interface DriverOptionProps {
  value: 'mysql' | 'postgres';
  checked: boolean;
  onSelect: (value: 'mysql' | 'postgres') => void;
  label: string;
  hint: string;
}

function DriverOption(props: DriverOptionProps): React.JSX.Element {
  const inputId = `driver-${props.value}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors',
        'hover:border-primary/60 hover:bg-accent/40',
        props.checked && 'border-primary bg-primary/5',
      )}
    >
      <input
        id={inputId}
        type="radio"
        name="db-driver"
        value={props.value}
        checked={props.checked}
        onChange={() => props.onSelect(props.value)}
        className="sr-only"
      />
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{props.label}</span>
        {props.checked && (
          <Icon icon={CheckCircle2} className="size-5 text-primary" aria-hidden="true" />
        )}
      </span>
      <span className="text-xs text-muted-foreground">{props.hint}</span>
    </label>
  );
}

export { DEFAULT_URLS };
