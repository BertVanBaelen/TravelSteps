import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ImmichAlbum, ImmichAsset, ImmichAssetPage } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useT } from '../i18n';
import { mediaUrl } from '../lib/format';
import { Alert } from './Field';
import { CloseIcon } from './icons';

type Tab = 'timeline' | 'albums' | 'search';
const PAGE_SIZE = 60;

interface Props {
  initial: string[];
  /** Maximum number of photos; 1 turns it into a single-photo picker. */
  max?: number;
  onDone: (ids: string[]) => void;
  onClose: () => void;
}

/** Modal to pick photos from Immich (timeline, albums or smart search). */
export function PhotoPicker({ initial, max = 100, onDone, onClose }: Props) {
  const msg = useT();
  const [tab, setTab] = useState<Tab>('timeline');
  const [selected, setSelected] = useState<string[]>(initial);
  const [album, setAlbum] = useState<ImmichAlbum | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const toggle = (id: string) => {
    if (max === 1) {
      setSelected((s) => (s[0] === id ? [] : [id]));
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  };

  const source =
    tab === 'timeline'
      ? '/immich/assets?'
      : tab === 'albums' && album
        ? `/immich/assets?albumId=${album.id}&`
        : tab === 'search' && submittedQuery
          ? `/immich/assets?q=${encodeURIComponent(submittedQuery)}&`
          : null;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={msg.picker.title}>
      <header className="modal-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={msg.common.close}>
          <CloseIcon />
        </button>
        <strong>{msg.picker.title}</strong>
        <button type="button" className="btn btn-primary btn-small" onClick={() => onDone(selected)}>
          {msg.picker.done(selected.length)}
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {(['timeline', 'albums', 'search'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {msg.picker[t]}
          </button>
        ))}
      </nav>
      <div className="modal-body">
        {tab === 'albums' && !album && <AlbumList onPick={setAlbum} />}
        {tab === 'albums' && album && (
          <div className="picker-subhead">
            <button type="button" className="btn btn-link" onClick={() => setAlbum(null)}>
              {msg.picker.backToAlbums}
            </button>
            <strong>{album.name}</strong>
          </div>
        )}
        {tab === 'search' && (
          <form
            className="field-row picker-search"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setSubmittedQuery(query.trim());
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={msg.picker.searchPlaceholder}
              aria-label={msg.picker.search}
            />
            <button className="btn btn-secondary" type="submit">
              {msg.picker.searchButton}
            </button>
          </form>
        )}
        {source && <AssetGrid key={source} source={source} selected={selected} onToggle={toggle} />}
      </div>
    </div>
  );
}

function AlbumList({ onPick }: { onPick: (a: ImmichAlbum) => void }) {
  const msg = useT();
  const [albums, setAlbums] = useState<ImmichAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ albums: ImmichAlbum[] }>('/immich/albums')
      .then((r) => setAlbums(r.albums))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!albums) return <p className="muted">{msg.loading}</p>;
  if (albums.length === 0) return <p className="muted">{msg.picker.noAlbums}</p>;
  return (
    <ul className="album-grid">
      {albums.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onPick(a)}>
            {a.thumbnailAssetId ? (
              <img src={mediaUrl(a.thumbnailAssetId, 'thumbnail')} alt="" loading="lazy" />
            ) : (
              <span className="album-empty" />
            )}
            <strong>{a.name}</strong>
            <span className="muted">{msg.picker.assets(a.assetCount)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AssetGrid({
  source,
  selected,
  onToggle,
}: {
  source: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const msg = useT();
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || nextPage === null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api<ImmichAssetPage>(`${source}page=${nextPage}&size=${PAGE_SIZE}`);
      setAssets((a) => [...a, ...r.items.filter((x) => !a.some((y) => y.id === x.id))]);
      setNextPage(r.nextPage);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [source, nextPage, loading]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, error]);

  return (
    <>
      {error && (
        <Alert kind="error">
          {error}{' '}
          <button type="button" className="btn-text" onClick={() => void loadMore()}>
            {msg.common.retry}
          </button>
        </Alert>
      )}
      <ul className="asset-grid">
        {assets.map((a) => {
          const pos = selected.indexOf(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                className={pos >= 0 ? 'selected' : ''}
                aria-pressed={pos >= 0}
                onClick={() => onToggle(a.id)}
                title={[a.fileName, a.place].filter(Boolean).join(' · ')}
              >
                <img src={mediaUrl(a.id, 'thumbnail')} alt={a.fileName ?? ''} loading="lazy" />
                {pos >= 0 && <span className="select-badge">{pos + 1}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {!loading && !error && nextPage === null && assets.length === 0 && (
        <p className="muted">{msg.picker.empty}</p>
      )}
      {loading && <p className="muted">{msg.loading}</p>}
      <div ref={sentinel} className="sentinel" />
    </>
  );
}
