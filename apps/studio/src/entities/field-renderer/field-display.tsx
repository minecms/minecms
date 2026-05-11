import { Badge } from '@minecms/ui';
import type { SerializedField } from './types';

/**
 * Inline-отображение значения поля для таблицы списка документов. Длинные строки
 * truncate, boolean показывается бейджем, числа — табулярными цифрами,
 * вложенные структуры (`object` / `array` / `union` / `reference`) — компактные
 * саммари.
 */
export interface FieldDisplayProps {
  field: SerializedField;
  value: unknown;
}

export function FieldDisplay(props: FieldDisplayProps): React.JSX.Element {
  const { field, value } = props;

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  switch (field.type) {
    case 'boolean':
      return (
        <Badge variant={value === true ? 'success' : 'muted'}>
          {value === true ? 'Да' : 'Нет'}
        </Badge>
      );
    case 'number':
      return <span className="tabular-nums">{String(value)}</span>;
    case 'slug':
      return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{String(value)}</code>;
    case 'text': {
      const text = String(value);
      const trimmed = text.length > 80 ? `${text.slice(0, 80)}…` : text;
      return <span className="text-muted-foreground">{trimmed}</span>;
    }
    case 'richText': {
      // Для списка документов показываем плоский текст из ProseMirror JSON.
      const flat = collectRichTextPlain(value).trim();
      if (flat.length === 0) return <span className="text-muted-foreground">—</span>;
      const trimmed = flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
      return <span className="text-muted-foreground">{trimmed}</span>;
    }
    case 'reference': {
      const id = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(id) || id <= 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <Badge variant="muted">
          {field.to.join('|')} #{id}
        </Badge>
      );
    }
    case 'image': {
      if (typeof value !== 'object' || value === null) {
        return <span className="text-muted-foreground">—</span>;
      }
      const obj = value as { assetId?: unknown };
      if (typeof obj.assetId !== 'number' || obj.assetId <= 0) {
        return <span className="text-muted-foreground">—</span>;
      }
      return <Badge variant="muted">image #{obj.assetId}</Badge>;
    }
    case 'array': {
      if (!Array.isArray(value)) return <span className="text-muted-foreground">—</span>;
      return <Badge variant="muted">{value.length} шт.</Badge>;
    }
    case 'object': {
      if (typeof value !== 'object') return <span className="text-muted-foreground">—</span>;
      const keys = Object.keys(value as Record<string, unknown>);
      return <span className="text-muted-foreground">{keys.length} полей</span>;
    }
    case 'union': {
      if (typeof value !== 'object' || value === null) {
        return <span className="text-muted-foreground">—</span>;
      }
      const disc = (value as Record<string, unknown>)[field.discriminator];
      const variantKey = typeof disc === 'string' ? disc : null;
      const label = variantKey ? (field.variants[variantKey]?.label ?? variantKey) : '?';
      return <Badge variant="muted">{label}</Badge>;
    }
    default:
      return <span className="block max-w-[40ch] truncate">{String(value)}</span>;
  }
}

/**
 * Обходит ProseMirror JSON и собирает только текстовые узлы. Лимит длины
 * усекается у вызывающего; здесь — без обрезки, чтобы тестировалось одной функцией.
 */
function collectRichTextPlain(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof n.text === 'string') out.push(n.text);
    if (Array.isArray(n.content)) {
      for (const c of n.content) visit(c);
    }
  };
  visit(value);
  return out.join(' ');
}
