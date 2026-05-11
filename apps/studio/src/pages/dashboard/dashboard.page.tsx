import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
} from '@minecms/ui';
import { ArrowRight, FileText } from '@minecms/ui/icons';
import { Link } from '@tanstack/react-router';
import { trpc } from '../../shared/api/client';
import { AppShell } from '../../widgets/app-shell/app-shell';

/**
 * Дашборд: приветствие + карточки по каждой пользовательской схеме со счётчиком
 * документов через `documents.count`. Кликабельная карточка ведёт на список схемы.
 */
export function DashboardPage(): React.JSX.Element {
  const schemasQuery = trpc.schemas.list.useQuery();
  const me = trpc.auth.me.useQuery();
  const list = schemasQuery.data?.schemas ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Панель</h1>
          {me.data?.user && (
            <p className="text-sm text-muted-foreground">Вы вошли как {me.data.user.email}.</p>
          )}
        </header>

        {list.length === 0 && !schemasQuery.isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Схемы не объявлены</CardTitle>
              <CardDescription>
                Опишите контент-модели в <code>minecms.config.ts</code> через{' '}
                <code>defineSchema()</code> — Studio автоматически построит формы и списки.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((schema) => (
              <SchemaCard key={schema.name} schemaName={schema.name} schemaLabel={schema.label} />
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function SchemaCard(props: { schemaName: string; schemaLabel: string }): React.JSX.Element {
  const countQuery = trpc.documents.count.useQuery({ schema: props.schemaName });
  const total = countQuery.data?.total ?? null;

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon icon={FileText} className="size-4 text-muted-foreground" />
            {props.schemaLabel}
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">{props.schemaName}</span>
        </div>
        <CardDescription>
          {countQuery.isLoading
            ? 'Считаем документы…'
            : countQuery.isError
              ? 'Не удалось получить счётчик'
              : `${total} ${plural(total ?? 0, ['документ', 'документа', 'документов'])}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" asChild>
          <Link to="/schema/$schemaName" params={{ schemaName: props.schemaName }}>
            Открыть список <Icon icon={ArrowRight} />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
