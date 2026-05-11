import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
} from '@minecms/ui';
import { AlertTriangle, RefreshCw } from '@minecms/ui/icons';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * Единый экран ошибок Studio. Используется как `errorComponent` для всего дерева
 * роутов, плюс может вызываться напрямую из feature-кода через `<ErrorScreen />`.
 *
 * Поведение:
 * 1. Превращает технические сообщения tRPC/fetch (например, «Failed to execute
 *    'json' on 'Response': Unexpected end of JSON input») в человеческое
 *    объяснение по типу ошибки. Технический текст прячется в `<details>`.
 * 2. Даёт прямую кнопку «Повторить» — `router.invalidate()` перезапускает
 *    `beforeLoad`/loader'ы текущего match'а без полного `location.reload()`.
 */
export interface ErrorScreenProps {
  error: unknown;
  reset?: () => void;
}

export function ErrorScreen({ error, reset }: ErrorScreenProps): React.JSX.Element {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  const { title, description } = humanizeError(error);
  const technical = extractTechnicalMessage(error);

  const onRetry = async () => {
    setIsRetrying(true);
    try {
      reset?.();
      await router.invalidate();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Icon icon={AlertTriangle} className="size-5" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={onRetry} disabled={isRetrying}>
            <Icon icon={RefreshCw} className={isRetrying ? 'animate-spin' : undefined} />
            {isRetrying ? 'Перезагружаем…' : 'Повторить'}
          </Button>
          {technical && (
            <details className="group rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none text-foreground/80 group-open:mb-2">
                Технические подробности
              </summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                {technical}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Превращает любую ошибку (Error, TRPCClientError, plain object/string) в
 * пару «заголовок + описание» на русском. Различаем три типа ситуаций:
 *
 *   - сеть/сервер недоступен → «нет связи с сервером»
 *   - сервер ответил, но не JSON или без auth → «сервер вернул не то, что ждали»
 *   - всё остальное → общий fallback с просьбой повторить
 *
 * Никогда не пробрасываем сырое `error.message` пользователю — он не должен
 * видеть текст вида `Failed to execute 'json' on 'Response'`.
 */
function humanizeError(error: unknown): { title: string; description: string } {
  const raw = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  if (
    raw.includes('failed to fetch') ||
    raw.includes('networkerror') ||
    raw.includes('econnrefused')
  ) {
    return {
      title: 'Нет связи с сервером',
      description:
        'Studio не может достучаться до @minecms/server. Проверь, что сервер запущен и доступен по тому же адресу, что и Studio.',
    };
  }

  if (
    raw.includes('json input') ||
    raw.includes('unexpected token') ||
    raw.includes('502') ||
    raw.includes('bad gateway') ||
    raw.includes('504')
  ) {
    return {
      title: 'Сервер сейчас недоступен',
      description:
        'Сервер ответил пустым или некорректным ответом. Скорее всего, он перезапускается. Подожди пару секунд и нажми «Повторить».',
    };
  }

  if (
    raw.includes('unauthorized') ||
    raw.includes('401') ||
    raw.includes('forbidden') ||
    raw.includes('403')
  ) {
    return {
      title: 'Доступ закрыт',
      description: 'Сессия истекла или недостаточно прав. Войди в Studio заново.',
    };
  }

  if (raw.includes('not found') || raw.includes('404')) {
    return {
      title: 'Страница не найдена',
      description: 'Запрошенный документ или маршрут не существует.',
    };
  }

  return {
    title: 'Что-то пошло не так',
    description:
      'Не получилось выполнить операцию. Попробуй повторить — если ошибка повторится, открой технические подробности ниже.',
  };
}

function extractTechnicalMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) {
    return [error.name, error.message].filter(Boolean).join(': ') || null;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return null;
  }
}
