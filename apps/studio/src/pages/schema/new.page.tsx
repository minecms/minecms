import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  Icon,
  Skeleton,
} from '@minecms/ui';
import { ArrowLeft } from '@minecms/ui/icons';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { DocumentEditForm } from '../../features/document-edit/edit-form';
import { trpc } from '../../shared/api/client';

/**
 * Создание документа коллекции (`/schema/$name/new`). Рендерится в main `SchemaLayout`.
 * Для singleton канонический URL — `/schema/$name` (редактирование там же).
 */
export function SchemaNewPage(): React.JSX.Element {
  const { schemaName } = useParams({ from: '/schema/$schemaName/new' });
  const schemasQuery = trpc.schemas.list.useQuery();
  const schema = schemasQuery.data?.schemas.find((s) => s.name === schemaName);

  if (schemasQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!schema) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Схема не найдена</AlertTitle>
        <AlertDescription>
          Схема <code>{schemaName}</code> не объявлена.
        </AlertDescription>
      </Alert>
    );
  }

  if (schema.singleton) {
    return <Navigate to="/schema/$schemaName" params={{ schemaName: schema.name }} replace />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          to="/schema/$schemaName"
          params={{ schemaName: schema.name }}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden"
        >
          <Icon icon={ArrowLeft} className="size-3.5" /> К списку
        </Link>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Новая запись · {schema.label} <span className="text-muted-foreground">·</span>{' '}
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
