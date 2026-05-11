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

/** Страница редактирования существующего документа по `id`. Рендерится в main `SchemaLayout`. */
export function SchemaEditPage(): React.JSX.Element {
  const { schemaName, documentId } = useParams({ from: '/schema/$schemaName/$documentId' });
  const numericId = Number(documentId);
  const schemasQuery = trpc.schemas.list.useQuery();
  const schema = schemasQuery.data?.schemas.find((s) => s.name === schemaName);
  const documentQuery = trpc.documents.get.useQuery(
    { schema: schemaName, id: numericId },
    {
      enabled: schema !== undefined && schema.singleton === false && Number.isFinite(numericId),
    },
  );

  if (schemasQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (schema?.singleton) {
    return <Navigate to="/schema/$schemaName" params={{ schemaName: schema.name }} replace />;
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

  if (!Number.isFinite(numericId)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Неверный идентификатор</AlertTitle>
        <AlertDescription>
          Документ <code>{documentId}</code> не похож на число.
        </AlertDescription>
      </Alert>
    );
  }

  if (documentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (documentQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Документ не найден</AlertTitle>
        <AlertDescription>{documentQuery.error.message}</AlertDescription>
      </Alert>
    );
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
          {schema.label} · <code>{schema.type}</code> · #{numericId}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Редактирование документа</h1>
      </header>
      <Card>
        <CardContent className="pt-6">
          <DocumentEditForm
            schema={schema}
            documentId={numericId}
            {...(documentQuery.data?.item
              ? { initial: documentQuery.data.item as Record<string, unknown> }
              : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
