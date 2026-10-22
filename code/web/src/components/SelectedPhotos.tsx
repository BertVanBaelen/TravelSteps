import { useState } from 'react';
import { useT } from '../i18n';
import { mediaUrl } from '../lib/format';
import { ChevronLeft, ChevronRight } from './icons';

/** Ordered list of chosen photos; reorder by drag-and-drop or arrows. First photo = cover. */
export function SelectedPhotos({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (ids: string[]) => void;
}) {
  const msg = useT();
  const [dragging, setDragging] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  if (photos.length === 0) return <p className="muted">{msg.editor.noPhotos}</p>;

  return (
    <ol className="selected-photos">
      {photos.map((id, i) => (
        <li
          key={id}
          draggable
          onDragStart={() => setDragging(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging !== null) move(dragging, i);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
          className={dragging === i ? 'dragging' : ''}
        >
          <img src={mediaUrl(id, 'thumbnail')} alt="" loading="lazy" draggable={false} />
          {i === 0 && <span className="cover-badge">{msg.editor.cover}</span>}
          <div className="photo-tools">
            <button
              type="button"
              onClick={() => move(i, i - 1)}
              disabled={i === 0}
              aria-label={msg.editor.moveLeft}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              onClick={() => onChange(photos.filter((x) => x !== id))}
              aria-label={msg.editor.removePhoto}
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => move(i, i + 1)}
              disabled={i === photos.length - 1}
              aria-label={msg.editor.moveRight}
            >
              <ChevronRight />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
