import { Button, Field, FieldDescription, FieldError, FieldLabel, Icon } from '@minecms/ui';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from '@minecms/ui/icons';
import { Highlight } from '@tiptap/extension-highlight';
import { Image as TiptapImage } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import {
  type Content,
  type Editor,
  EditorContent,
  type Extension,
  type JSONContent,
  useEditor,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useEffect, useMemo } from 'react';
import type { SerializedField } from './types';

/** Перечень доступных фич — должен соответствовать `RichTextFeature` в @minecms/core. */
type Feature =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'underline'
  | 'code'
  | 'highlight'
  | 'link'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'textAlign'
  | 'subscript'
  | 'superscript'
  | 'image'
  | 'table';

const ALL_FEATURES: readonly Feature[] = [
  'bold',
  'italic',
  'strike',
  'underline',
  'code',
  'highlight',
  'link',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'textAlign',
  'subscript',
  'superscript',
  'image',
  'table',
];

type RichTextDocLike = JSONContent & { type: 'doc' };

export interface RichTextInputProps {
  name: string;
  field: Extract<SerializedField, { type: 'richText' }>;
  value: unknown;
  onChange: (value: RichTextDocLike) => void;
  onBlur?: () => void;
  error?: string;
}

const EMPTY_DOC: RichTextDocLike = { type: 'doc', content: [{ type: 'paragraph' }] };

function isRichTextDoc(v: unknown): v is RichTextDocLike {
  return Boolean(v) && typeof v === 'object' && (v as { type?: unknown }).type === 'doc';
}

/** Минимальный baseline: если `features` не задан — доступны только bold и italic. */
const DEFAULT_FEATURES: readonly Feature[] = ['bold', 'italic'];

/**
 * Нормализует список фич из схемы. Если `features` не задан/пуст — возвращаем
 * минимальный baseline (`bold`, `italic`). Явно заданный массив используется
 * как whitelist: ничего сверх него.
 */
function resolveFeatures(input: string[] | undefined): Set<Feature> {
  if (!input || input.length === 0) {
    return new Set(DEFAULT_FEATURES);
  }
  const allowed = new Set<Feature>();
  for (const raw of input) {
    if ((ALL_FEATURES as readonly string[]).includes(raw)) {
      allowed.add(raw as Feature);
    }
  }
  return allowed;
}

/**
 * Rich-text-редактор на TipTap 3. Доступные расширения определяются `features`
 * в схеме (`defineField.richText`). Не указано — включены все.
 *
 * Контракт значения — ProseMirror JSON. Старт без содержимого инициализируется
 * пустым параграфом, иначе TipTap не может поставить курсор в редактор.
 */
export function RichTextInput(props: RichTextInputProps): React.JSX.Element {
  const { name, field, value, onChange, onBlur, error } = props;
  const id = `field-${name}`;
  const initial = isRichTextDoc(value) ? value : EMPTY_DOC;

  const features = useMemo(() => resolveFeatures(field.features), [field.features]);

  const extensions = useMemo(() => {
    // Marks/nodes из StarterKit отключаем явно (`false`), если фича не разрешена,
    // и включаем (`{}` или конфиг), если разрешена. `undefined` для StarterKit
    // означает «оставить default», то есть mark остаётся доступным через Ctrl+B и
    // подобные горячие клавиши — это противоречит whitelist-семантике `features`.
    const starterConfig: Record<string, unknown> = {
      bold: features.has('bold') ? {} : false,
      italic: features.has('italic') ? {} : false,
      strike: features.has('strike') ? {} : false,
      code: features.has('code') ? {} : false,
      heading: features.has('heading') ? { levels: [1, 2, 3, 4] } : false,
      bulletList: features.has('bulletList') ? {} : false,
      orderedList: features.has('orderedList') ? {} : false,
      blockquote: features.has('blockquote') ? {} : false,
      codeBlock: features.has('codeBlock') ? {} : false,
      horizontalRule: features.has('horizontalRule') ? {} : false,
      listItem: features.has('bulletList') || features.has('orderedList') ? {} : false,
    };
    const list: Extension[] = [
      // biome-ignore lint/suspicious/noExplicitAny: StarterKit принимает разнородные опции
      StarterKit.configure(starterConfig as any) as unknown as Extension,
    ];

    if (features.has('underline')) list.push(Underline as unknown as Extension);
    if (features.has('highlight')) {
      list.push(Highlight.configure({ multicolor: false }) as unknown as Extension);
    }
    if (features.has('link')) {
      list.push(
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        }) as unknown as Extension,
      );
    }
    if (features.has('subscript')) list.push(Subscript as unknown as Extension);
    if (features.has('superscript')) list.push(Superscript as unknown as Extension);
    if (features.has('image')) {
      list.push(TiptapImage.configure({ inline: false }) as unknown as Extension);
    }
    if (features.has('textAlign')) {
      const types: string[] = ['paragraph'];
      if (features.has('heading')) types.push('heading');
      list.push(
        TextAlign.configure({
          types,
          alignments: ['left', 'center', 'right', 'justify'],
        }),
      );
    }
    if (features.has('taskList')) {
      list.push(TaskList as unknown as Extension);
      list.push(TaskItem.configure({ nested: true }) as unknown as Extension);
    }
    if (features.has('table')) {
      list.push(Table.configure({ resizable: true }) as unknown as Extension);
      list.push(TableRow as unknown as Extension);
      list.push(TableHeader as unknown as Extension);
      list.push(TableCell as unknown as Extension);
    }
    return list;
  }, [features]);

  const editor = useEditor(
    {
      extensions,
      content: initial as Content,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          id,
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': field.label,
          class:
            'tiptap min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        },
      },
      onUpdate({ editor }) {
        onChange(editor.getJSON() as RichTextDocLike);
      },
      onBlur() {
        onBlur?.();
      },
    },
    [extensions],
  );

  // Внешняя перезапись value (reset формы / переключение документов) → setContent.
  useEffect(() => {
    if (!editor) return;
    const next = isRichTextDoc(value) ? value : EMPTY_DOC;
    const current = editor.getJSON();
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    editor.commands.setContent(next as Content, { emitUpdate: false });
  }, [editor, value]);

  return (
    <Field data-invalid={error ? 'true' : undefined}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {!field.optional && <span className="ml-1 text-destructive">*</span>}
      </FieldLabel>
      <Toolbar editor={editor} features={features} />
      <EditorContent editor={editor} />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : field.description ? (
        <FieldDescription>{field.description}</FieldDescription>
      ) : null}
    </Field>
  );
}

/** Кнопки форматирования. Активное состояние подсвечивается через `aria-pressed`. */
function Toolbar({
  editor,
  features,
}: {
  editor: Editor | null;
  features: Set<Feature>;
}): React.JSX.Element {
  if (!editor) {
    return <div className="flex flex-wrap gap-1 rounded-md border border-input bg-muted/40 p-1" />;
  }

  const groups: React.ReactNode[] = [];

  // Группа 1 — inline marks.
  const inline: React.ReactNode[] = [];
  if (features.has('bold')) {
    inline.push(
      <ToolButton
        key="bold"
        label="Полужирный"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Icon icon={Bold} />
      </ToolButton>,
    );
  }
  if (features.has('italic')) {
    inline.push(
      <ToolButton
        key="italic"
        label="Курсив"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Icon icon={Italic} />
      </ToolButton>,
    );
  }
  if (features.has('underline')) {
    inline.push(
      <ToolButton
        key="underline"
        label="Подчёркнутый"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Icon icon={UnderlineIcon} />
      </ToolButton>,
    );
  }
  if (features.has('strike')) {
    inline.push(
      <ToolButton
        key="strike"
        label="Зачёркнутый"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Icon icon={Strikethrough} />
      </ToolButton>,
    );
  }
  if (features.has('code')) {
    inline.push(
      <ToolButton
        key="code"
        label="Моноширинный"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Icon icon={Code} />
      </ToolButton>,
    );
  }
  if (features.has('highlight')) {
    inline.push(
      <ToolButton
        key="highlight"
        label="Маркер"
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Icon icon={Highlighter} />
      </ToolButton>,
    );
  }
  if (features.has('subscript')) {
    inline.push(
      <ToolButton
        key="subscript"
        label="Нижний индекс"
        active={editor.isActive('subscript')}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <Icon icon={SubscriptIcon} />
      </ToolButton>,
    );
  }
  if (features.has('superscript')) {
    inline.push(
      <ToolButton
        key="superscript"
        label="Верхний индекс"
        active={editor.isActive('superscript')}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <Icon icon={SuperscriptIcon} />
      </ToolButton>,
    );
  }
  if (features.has('link')) {
    inline.push(
      <ToolButton
        key="link"
        label="Ссылка"
        active={editor.isActive('link')}
        onClick={() => {
          const previousUrl = (editor.getAttributes('link') as { href?: string }).href ?? '';
          const url = window.prompt('URL ссылки', previousUrl);
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
      >
        <Icon icon={LinkIcon} />
      </ToolButton>,
    );
  }
  if (inline.length > 0) groups.push(<Group key="inline">{inline}</Group>);

  // Группа 2 — блоки.
  const block: React.ReactNode[] = [];
  if (features.has('heading')) {
    block.push(
      <ToolButton
        key="h2"
        label="Заголовок 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Icon icon={Heading2} />
      </ToolButton>,
    );
    block.push(
      <ToolButton
        key="h3"
        label="Заголовок 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Icon icon={Heading3} />
      </ToolButton>,
    );
  }
  if (features.has('bulletList')) {
    block.push(
      <ToolButton
        key="ul"
        label="Маркированный список"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <Icon icon={List} />
      </ToolButton>,
    );
  }
  if (features.has('orderedList')) {
    block.push(
      <ToolButton
        key="ol"
        label="Нумерованный список"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <Icon icon={ListOrdered} />
      </ToolButton>,
    );
  }
  if (features.has('taskList')) {
    block.push(
      <ToolButton
        key="task"
        label="Список задач"
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <Icon icon={ListChecks} />
      </ToolButton>,
    );
  }
  if (features.has('blockquote')) {
    block.push(
      <ToolButton
        key="quote"
        label="Цитата"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Icon icon={Quote} />
      </ToolButton>,
    );
  }
  if (features.has('codeBlock')) {
    block.push(
      <ToolButton
        key="codeblock"
        label="Блок кода"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Icon icon={Code} />
      </ToolButton>,
    );
  }
  if (features.has('horizontalRule')) {
    block.push(
      <ToolButton
        key="hr"
        label="Разделитель"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Icon icon={Minus} />
      </ToolButton>,
    );
  }
  if (block.length > 0) groups.push(<Group key="block">{block}</Group>);

  // Группа 3 — выравнивание.
  if (features.has('textAlign')) {
    groups.push(
      <Group key="align">
        <ToolButton
          label="По левому краю"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <Icon icon={AlignLeft} />
        </ToolButton>
        <ToolButton
          label="По центру"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <Icon icon={AlignCenter} />
        </ToolButton>
        <ToolButton
          label="По правому краю"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <Icon icon={AlignRight} />
        </ToolButton>
        <ToolButton
          label="По ширине"
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <Icon icon={AlignJustify} />
        </ToolButton>
      </Group>,
    );
  }

  // Группа 4 — вставка контента.
  const insert: React.ReactNode[] = [];
  if (features.has('image')) {
    insert.push(
      <ToolButton
        key="image"
        label="Изображение"
        onClick={() => {
          const url = window.prompt('URL изображения');
          if (!url) return;
          editor.chain().focus().setImage({ src: url }).run();
        }}
      >
        <Icon icon={ImageIcon} />
      </ToolButton>,
    );
  }
  if (features.has('table')) {
    insert.push(
      <ToolButton
        key="table"
        label="Таблица"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <Icon icon={TableIcon} />
      </ToolButton>,
    );
  }
  if (insert.length > 0) groups.push(<Group key="insert">{insert}</Group>);

  // Группа 5 — undo/redo (всегда).
  groups.push(
    <Group key="history">
      <ToolButton
        label="Отменить"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Icon icon={Undo2} />
      </ToolButton>
      <ToolButton
        label="Повторить"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Icon icon={Redo2} />
      </ToolButton>
    </Group>,
  );

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-muted/40 p-1 select-none"
      onDragStart={(e) => e.preventDefault()}
    >
      {groups.map((g, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: статичный порядок групп
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <Divider />}
          {g}
        </span>
      ))}
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="flex items-center gap-1">{children}</span>;
}

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolButton(props: ToolButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      size="icon"
      variant={props.active ? 'secondary' : 'ghost'}
      aria-label={props.label}
      aria-pressed={props.active === true}
      title={props.label}
      draggable={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
      disabled={props.disabled === true}
    >
      {props.children}
    </Button>
  );
}

function Divider(): React.JSX.Element {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />;
}
