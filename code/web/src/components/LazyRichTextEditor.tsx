import { lazy, Suspense } from 'react';
import type { RichTextEditorProps } from './RichTextEditor';

function PlainEditor(props: RichTextEditorProps) {
  return (
    <textarea
      id={props.id}
      aria-label={props['aria-label']}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      disabled={props.disabled}
      maxLength={props.maxLength}
      style={{ minHeight: props.minHeight ?? 160 }}
    />
  );
}

// When the editor chunk cannot be loaded (offline, or an outdated cache after an update),
// keep the plain Markdown textarea instead of breaking the page.
const RichTextEditor = lazy(() =>
  import('./RichTextEditor')
    .then((m) => ({ default: m.RichTextEditor }))
    .catch((err: unknown) => {
      console.warn('Teksteditor kon niet worden geladen', err);
      return { default: PlainEditor };
    }),
);

/** Loads the TipTap editor on demand; shows a plain Markdown textarea until it is ready. */
export function LazyRichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<PlainEditor {...props} />}>
      <RichTextEditor {...props} />
    </Suspense>
  );
}
