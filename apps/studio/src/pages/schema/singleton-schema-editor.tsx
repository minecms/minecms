import { Alert, AlertDescription, AlertTitle, Card, CardContent, Skeleton } from '@minecms/ui';
import type { SerializedSchema } from '../../entities/field-renderer';
import { DocumentEditForm } from '../../features/document-edit/edit-form';
import { trpc } from '../../shared/api/client';

type Props = {
  schema: SerializedSchema;
  documentId: number;
};

/**
 * Редактирование singleton на каноническом пути `/schema/$schemaName` (без `/id` в URL).
 */
export function SingletonSchemaEditor(props: Props): React.JSX.Element {
  const documentQuery = trpc.documents.get.useQuery(
    { schema: props.schema.name, id: props.documentId },
    { enabled: Number.isFinite(props.documentId) },
  );

  if (documentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!Number.isFinite(props.documentId)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Неверный идентификатор</AlertTitle>
        <AlertDescription>Не удалось определить id документа.</AlertDescription>
      </Alert>
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
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {props.schema.label} · <code>{props.schema.type}</code>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Редактирование</h1>
      </header>
      <Card>
        <CardContent className="pt-6">
          <DocumentEditForm
            schema={props.schema}
            documentId={props.documentId}
            {...(documentQuery.data?.item
              ? { initial: documentQuery.data.item as Record<string, unknown> }
              : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
