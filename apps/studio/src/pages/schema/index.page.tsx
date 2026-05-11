import { Button, Card, CardContent, Icon, Skeleton } from '@minecms/ui';
import { Plus } from '@minecms/ui/icons';
import { Link, useParams } from '@tanstack/react-router';
import { DocumentEditForm } from '../../features/document-edit/edit-form';
import { trpc } from '../../shared/api/client';
import { DocumentListSidebar } from '../../widgets/app-shell/document-list-sidebar';
import { SingletonSchemaEditor } from './singleton-schema-editor';

/**
 * Index-страница `/schema/$schemaName`. Поведение зависит от типа схемы:
 *
 * - singleton: загружаем единственную запись или показываем форму создания,
 *   если её ещё нет — редактор живёт прямо на этом URL без `/id`;
 * - коллекция: показываем empty-state главного пейна («Выберите запись» или
 *   «Создать первую») — реальный список рендерится третьим сайдбаром через
 *   `SchemaLayout`.
 */
export function SchemaIndexPage(): React.JSX.Element {
  const { schemaName } = useParams({ from: '/schema/$schemaName/' });
  const schemasQuery = trpc.schemas.list.useQuery();
  const schema = schemasQuery.data?.schemas.find((s) => s.name === schemaName);

  const singletonList = trpc.documents.list.useQuery(
    { schema: schemaName, limit: 1, offset: 0 },
    { enabled: Boolean(schema?.singleton) },
  );

  if (schemasQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!schema) return <div />;

  if (schema.singleton) {
    if (singletonList.isLoading || singletonList.isFetching) {
      return (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }
    const row = singletonList.data?.items[0] as { id?: unknown } | undefined;
    const id = row?.id;
    if (id !== undefined && id !== null && (singletonList.data?.total ?? 0) >= 1) {
      const numericId = Number(id);
      return <SingletonSchemaEditor schema={schema} documentId={numericId} />;
    }
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Единственная запись · {schema.label} <span className="text-muted-foreground">·</span>{' '}
            <code>{schema.type}</code>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Создание документа</h1>
        </header>
        <Card>
          <CardContent className="pt-6">
            <DocumentEditForm schema={schema} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Коллекция без выбранного документа.
  // На lg+ список уже виден третьим сайдбаром — показываем empty state.
  // На мобильных третьего сайдбара нет — отдаём тот же список inline в main.
  return (
    <>
      <div className="lg:hidden">
        <DocumentListSidebar schema={schema} variant="inline" />
      </div>
      <div className="hidden min-h-[60vh] items-center justify-center lg:flex">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{schema.label}</p>
          <h1 className="text-xl font-semibold tracking-tight">Выберите запись</h1>
          <p className="text-sm text-muted-foreground">
            Слева — список существующих документов схемы <code>{schema.type}</code>. Откройте любой
            для редактирования или создайте новый.
          </p>
          <Button asChild className="mt-2">
            <Link to="/schema/$schemaName/new" params={{ schemaName: schema.name }}>
              <Icon icon={Plus} /> Создать запись
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
