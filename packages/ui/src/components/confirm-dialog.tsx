import type * as React from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Заголовок диалога. */
  title: React.ReactNode;
  /** Поясняющий текст. Опционально. */
  description?: React.ReactNode;
  /** Подпись подтверждающей кнопки. По умолчанию «Удалить». */
  confirmLabel?: string;
  /** Подпись кнопки отмены. По умолчанию «Отмена». */
  cancelLabel?: string;
  /** Вариант подтверждающей кнопки — destructive по умолчанию для удалений. */
  variant?: 'destructive' | 'default';
  /** Признак «операция в процессе» — блокирует обе кнопки и меняет лейбл confirm. */
  loading?: boolean;
  /** Колбек подтверждения. Закрытие диалога — на стороне вызывающего после успеха. */
  onConfirm: () => void;
}

/**
 * Модалка подтверждения деструктивного действия.
 *
 * Используется как замена `window.confirm` для удалений документов, медиа и
 * любых операций, требующих второго клика. Контролируемый компонент: состояние
 * `open` живёт у владельца, `onConfirm` запускает мутацию, после её завершения
 * владелец сам закрывает диалог через `onOpenChange(false)`.
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const {
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Удалить',
    cancelLabel = 'Отмена',
    variant = 'destructive',
    loading = false,
    onConfirm,
  } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Пока идёт операция, закрытие из overlay/Esc игнорируем — выбор только
        // через кнопки внутри. Это страхует от случайной отмены подтверждения.
        if (loading) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Удаление…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
