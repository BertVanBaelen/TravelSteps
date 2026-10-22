import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { mediaUrl } from '../lib/format';
import { useOnline } from '../offline/db';
import { ChevronLeft, ChevronRight, CloseIcon, DownloadIcon } from './icons';

/**
 * Horizontal photo carousel (CSS scroll-snap: swipe on touch, arrows on desktop).
 * Swiping only scrolls; a tap/click on a photo calls `onSelect`.
 */
export function Carousel({
  photos,
  alt,
  onSelect,
  fit = 'contain',
}: {
  photos: string[];
  alt: string;
  onSelect: (index: number) => void;
  fit?: 'contain' | 'cover';
}) {
  const msg = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (photos.length === 0) return null;

  return (
    <div className={`gallery gallery-${fit}`}>
      <div className="gallery-track" ref={trackRef} onScroll={onScroll}>
        {photos.map((id, i) => (
          <button
            key={id}
            type="button"
            className="gallery-slide"
            onClick={() => onSelect(i)}
            aria-label={msg.post.photoOf(i + 1, photos.length)}
          >
            <img
              src={mediaUrl(id, 'preview')}
              alt={`${alt} – ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="gallery-nav gallery-prev"
            onClick={() => scrollTo(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label={msg.common.previous}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="gallery-nav gallery-next"
            onClick={() => scrollTo(Math.min(photos.length - 1, index + 1))}
            disabled={index === photos.length - 1}
            aria-label={msg.common.next}
          >
            <ChevronRight />
          </button>
          <div className="gallery-count">
            {index + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  );
}

/** Carousel with a fullscreen lightbox. */
export function Gallery({
  photos,
  alt,
  canDownload = false,
}: {
  photos: string[];
  alt: string;
  canDownload?: boolean;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (photos.length === 0) return null;
  return (
    <>
      <Carousel photos={photos} alt={alt} onSelect={setLightbox} />
      {lightbox !== null && (
        <Lightbox
          photos={photos}
          start={lightbox}
          alt={alt}
          canDownload={canDownload}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}

export function Lightbox({
  photos,
  start,
  alt,
  canDownload = false,
  extra,
  onClose,
}: {
  photos: string[];
  start: number;
  alt: string;
  canDownload?: boolean | ((index: number) => boolean);
  /** Extra content per photo in the top bar (e.g. a link to the post). */
  extra?: (index: number) => ReactNode;
  onClose: () => void;
}) {
  const msg = useT();
  const online = useOnline();
  const [i, setI] = useState(start);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      if (e.key === 'ArrowRight') setI((v) => Math.min(photos.length - 1, v + 1));
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, photos.length]);

  const touchX = useRef<number | null>(null);
  const id = photos[i]!;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={msg.post.photoOf(i + 1, photos.length)}
      onTouchStart={(e) => (touchX.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0]!.clientX - touchX.current;
        if (dx > 50) setI((v) => Math.max(0, v - 1));
        if (dx < -50) setI((v) => Math.min(photos.length - 1, v + 1));
        touchX.current = null;
      }}
    >
      <img src={mediaUrl(id, 'preview')} alt={`${alt} – ${i + 1}`} />
      <div className="lightbox-bar">
        <span>
          {i + 1} / {photos.length}
        </span>
        <span className="lightbox-extra">
          {extra?.(i)}
          {online && (typeof canDownload === 'function' ? canDownload(i) : canDownload) && (
            <a href={mediaUrl(id, 'original')} download className="lightbox-download">
              <DownloadIcon />
              {msg.post.original}
            </a>
          )}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={msg.common.close}>
          <CloseIcon />
        </button>
      </div>
      {i > 0 && (
        <button
          type="button"
          className="gallery-nav gallery-prev"
          onClick={() => setI(i - 1)}
          aria-label={msg.common.previous}
        >
          <ChevronLeft />
        </button>
      )}
      {i < photos.length - 1 && (
        <button
          type="button"
          className="gallery-nav gallery-next"
          onClick={() => setI(i + 1)}
          aria-label={msg.common.next}
        >
          <ChevronRight />
        </button>
      )}
    </div>
  );
}
