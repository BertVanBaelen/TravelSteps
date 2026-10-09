import { useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { nl } from '../i18n/nl';

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
  minHeight?: number;
  /** Maximum number of text characters (approximation of the Markdown length). */
  maxLength?: number;
}

const ALLOWED_URL = /^(https?:\/\/|mailto:)/i;

export function isAllowedLink(url: string): boolean {
  return ALLOWED_URL.test(url.trim());
}

/** WYSIWYG editor whose value in and out is a Markdown string (no raw HTML). */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
  minHeight = 160,
  maxLength,
}: RichTextEditorProps) {
  // Last Markdown we emitted or received, used to ignore our own echoes from the parent.
  const lastValue = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          protocols: ['mailto'],
          isAllowedUri: (url) => isAllowedLink(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
        },
      }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      CharacterCount.configure({ limit: maxLength ?? null }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'rte-content',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(id ? { id } : {}),
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const markdown = e.isEmpty ? '' : e.getMarkdown();
      if (markdown === lastValue.current) return;
      lastValue.current = markdown;
      onChangeRef.current(markdown);
    },
  });

  // Sync external value changes (draft loaded, conflict reload) without echoing onChange.
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    lastValue.current = value;
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  return (
    <div className={`rte${disabled ? ' rte-disabled' : ''}`}>
      {editor && <Toolbar editor={editor} disabled={disabled} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
    }),
  });

  const editLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? '';
    const input = window.prompt(nl.richText.linkPrompt, current || 'https://');
    if (input === null) return;
    const href = input.trim();
    if (href === '' || href === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!isAllowedLink(href)) {
      window.alert(nl.richText.invalidLink);
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const t = nl.richText;
  return (
    <div className="rte-toolbar" role="toolbar" aria-label={t.toolbar}>
      <ToolButton
        label={t.bold}
        active={state.bold}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </ToolButton>
      <ToolButton
        label={t.italic}
        active={state.italic}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </ToolButton>
      <ToolButton
        label={t.heading2}
        active={state.h2}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolButton>
      <ToolButton
        label={t.heading3}
        active={state.h3}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolButton>
      <ToolButton
        label={t.bulletList}
        active={state.bulletList}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </ToolButton>
      <ToolButton
        label={t.orderedList}
        active={state.orderedList}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolButton>
      <ToolButton
        label={t.quote}
        active={state.quote}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </ToolButton>
      <ToolButton label={t.link} active={state.link} disabled={disabled} onClick={editLink}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
        </svg>
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rte-btn${active ? ' active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection when tapping a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
