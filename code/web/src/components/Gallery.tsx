import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useT } from '../i18n';
import { mediaUrl } from '../lib/format';
import { useOnline } from '../offline/db';
import { ChevronLeft, ChevronRight, CloseIcon, DownloadIcon } from './icons';

export interface CarouselHandle {
  goTo: (index: number) => void;
}

/**
 * Horizontal photo carousel (CSS scroll-snap: swipe on touch, arrows on desktop).
 * Swiping only scrolls; a tap/click on a photo calls `onSelect`.
 * `indicator`: "1 / 3" on the photo, dots under it (no text on the photo), or nothing.
 */
export function Carousel({
  photos,
  alt,
  onSelect,
  fit = 'contain',
  indicator = 'count',
  handle,
  onIndexChange,
}: {
  photos: string[];
  alt: string;
  onSelect: (index: number) => void;
  fit?: 'contain' | 'cover';
  indicator?: 'count' | 'dots' | 'none';
  /** Lets the parent scroll to a photo (thumbnails on the step page). */
  handle?: RefObject<CarouselHandle | null>;
  onIndexChange?: (index: number) => void;
}) {
  const msg = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) {
      setIndex(i);
      onIndexChange?.(i);
    }
  };

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!handle) return;
    handle.current = { goTo: scrollTo };
    return () => {
      handle.current = null;
    };
  });

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
          {indicator === 'count' && (
            <div className="gallery-count">
              {index + 1} / {photos.length}
            </div>
          )}
          {indicator === 'dots' && (
            <p className="gallery-dots">
              {photos.map((id, i) => (
                <span key={id} className={i === index ? 'active' : undefined} aria-hidden />
              ))}
              <span className="sr-only">{msg.post.photoOf(index + 1, photos.length)}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Carousel with a fullscreen lightbox; `thumbnails` adds a row of small photos under it. */
export function Gallery({
  photos,
  alt,
  canDownload = false,
  thumbnails = false,
}: {
  photos: string[];
  alt: string;
  canDownload?: boolean;
  thumbnails?: boolean;
}) {
  const msg = useT();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const carousel = useRef<CarouselHandle | null>(null);
  if (photos.length === 0) return null;
  const withThumbs = thumbnails && photos.length > 1;
  return (
    <>
      <Carousel
        photos={photos}
        alt={alt}
        onSelect={setLightbox}
        fit={thumbnails ? 'cover' : 'contain'}
        indicator={withThumbs ? 'none' : 'count'}
        handle={carousel}
        onIndexChange={setCurrent}
      />
      {withThumbs && (
        <ul className="thumb-row" aria-label={msg.post.photos}>
          {photos.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="thumb"
                aria-label={msg.post.photoOf(i + 1, photos.length)}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => {
                  setCurrent(i);
                  carousel.current?.goTo(i);
                }}
              >
                <img src={mediaUrl(id, 'thumbnail')} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
