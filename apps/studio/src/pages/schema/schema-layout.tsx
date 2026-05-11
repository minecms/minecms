import { Alert, AlertDescription, AlertTitle, Skeleton } from '@minecms/ui';
import { Outlet, useParams } from '@tanstack/react-router';
import { trpc } from '../../shared/api/client';
import { AppShell } from '../../widgets/app-shell/app-shell';
import { DocumentListSidebar } from '../../widgets/app-shell/document-list-sidebar';

/**
 * Layout-роут `/schema/$schemaName`: оборачивает все варианты страницы
 * редактирования схемы (index, /new, /$documentId) в общий 3-pane shell.
 *
 * Для коллекций показываем `DocumentListSidebar` как третий пейн и
 * рендерим текущий child-route в main через `<Outlet />`.
 *
 * Для singleton третий пейн не нужен — редактор и так один; рендерим
 * только Outlet без секонд-сайдбара.
 */
export function SchemaLayout(): React.JSX.Element {
  const { schemaName } = useParams({ from: '/schema/$schemaName' });
  const schemasQuery = trpc.schemas.list.useQuery();
  const schema = schemasQuery.data?.schemas.find((s) => s.name === schemaName);

  if (schemasQuery.isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!schema) {
    return (
      <AppShell>
        <Alert variant="destructive">
          <AlertTitle>Схема не найдена</AlertTitle>
          <AlertDescription>
            Схема <code>{schemaName}</code> не объявлена в <code>minecms.config.ts</code>.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  if (schema.singleton) {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  return (
    <AppShell secondary={<DocumentListSidebar schema={schema} />}>
      <Outlet />
    </AppShell>
  );
}
