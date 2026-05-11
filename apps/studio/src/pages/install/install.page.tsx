import { Alert, AlertDescription, AlertTitle, Button, Icon } from '@minecms/ui';
import { ArrowRight } from '@minecms/ui/icons';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { AdminStep } from '../../features/install-admin/admin-step';
import { type DatabaseChoice, DatabaseStep } from '../../features/install-database/database-step';
import { InstallShell } from '../../widgets/install-shell/install-shell';

const STEPS = [
  { key: 'database', label: 'База данных' },
  { key: 'admin', label: 'Администратор' },
  { key: 'done', label: 'Готово' },
] as const;

const STEP_META: Record<(typeof STEPS)[number]['key'], { title: string; description: string }> = {
  database: {
    title: 'Подключение к базе данных',
    description:
      'Выберите драйвер и укажите строку подключения. Можно сразу проверить — сервер откроет временное соединение.',
  },
  admin: {
    title: 'Учётная запись администратора',
    description: 'Эту почту и пароль вы будете использовать для входа в Studio.',
  },
  done: {
    title: 'Установка завершена',
    description: 'Сервер записал миграции, создал админа и сохранил состояние установки.',
  },
};

/**
 * Корневая страница install-визарда. Управляет состоянием шага и передаёт выбор
 * БД из шага 1 в шаг 2. Финальный шаг 3 — статичный экран успеха с кнопкой
 * перехода на /login (он уже доступен — `installation_state = installed`).
 */
export function InstallPage(): React.JSX.Element {
  const [step, setStep] = useState<(typeof STEPS)[number]['key']>('database');
  const [database, setDatabase] = useState<DatabaseChoice | null>(null);
  const navigate = useNavigate();
  const meta = STEP_META[step];
  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <InstallShell
      steps={STEPS}
      current={currentIndex}
      title={meta.title}
      description={meta.description}
    >
      {step === 'database' && (
        <DatabaseStep
          {...(database ? { initial: database } : {})}
          onNext={(choice) => {
            setDatabase(choice);
            setStep('admin');
          }}
        />
      )}
      {step === 'admin' && database && (
        <AdminStep
          database={database}
          onBack={() => setStep('database')}
          onSuccess={() => setStep('done')}
        />
      )}
      {step === 'admin' && !database && (
        <Alert variant="destructive">
          <AlertTitle>Не выбрана БД</AlertTitle>
          <AlertDescription>Вернитесь к шагу 1 и укажите подключение.</AlertDescription>
        </Alert>
      )}
      {step === 'done' && (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>MineCMS установлена</AlertTitle>
            <AlertDescription>
              Cookie-сессии готовы, системные таблицы созданы. Войдите как администратор и
              переходите к управлению контентом.
            </AlertDescription>
          </Alert>
          <Button onClick={() => navigate({ to: '/login' })}>
            Перейти ко входу
            <Icon icon={ArrowRight} />
          </Button>
        </div>
      )}
    </InstallShell>
  );
}
