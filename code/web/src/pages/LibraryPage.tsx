import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LibraryPhoto } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { useBlog, withTraveller } from '../blog/BlogContext';
import { Alert } from '../components/Field';
import { Lightbox } from '../components/Gallery';
import { usePageTitle } from '../components/PageTitle';
import { nl } from '../i18n/nl';
import { formatDay, mediaUrl } from '../lib/format';

type GroupBy = 'datum' | 'reis';

interface Group {
  key: string;
  label: string;
  /** Indexes into the flat photo list. */
  items: number[];
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function LibraryPage() {
  usePageTitle(nl.library.title);
  const me = useUser();
  const { selected } = useBlog();
  const [params, setParams] = useSearchParams();
  const groupBy: GroupBy = params.get('per') === 'reis' ? 'reis' : 'datum';
  const [photos, setPhotos] = useState<LibraryPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setPhotos(null);
    setOpen(null);
    api<{ photos: LibraryPhoto[] }>(`/library?${withTraveller(new URLSearchParams(), selected)}`)
      .then((r) => setPhotos(r.photos))
      .catch((err) => setError(errorMessage(err)));
  }, [selected]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    (photos ?? []).forEach((p, i) => {
      const key = groupBy === 'reis' ? p.travelId : localDay(p.date);
      let g = map.get(key);
      if (!g) {
        g = { key, label: groupBy === 'reis' ? p.travelName : formatDay(key), items: [] };
        map.set(key, g);
      }
      g.items.push(i);
    });
    return [...map.values()];
  }, [photos, groupBy]);

  const ids = useMemo(() => (photos ?? []).map((p) => p.assetId), [photos]);

  return (
    <section className="page">
      <div className="segmented align-start" role="group" aria-label={nl.library.groupBy}>
        {(['datum', 'reis'] as const).map((g) => (
          <button
            key={g}
            type="button"
            className={groupBy === g ? 'active' : ''}
            aria-pressed={groupBy === g}
            onClick={() => setParams(g === 'datum' ? {} : { per: g }, { replace: true })}
          >
            {g === 'datum' ? nl.library.byDate : nl.library.byTravel}
          </button>
        ))}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {photos === null && !error && <p className="muted center">{nl.loading}</p>}
      {photos?.length === 0 && (
        <div className="card empty">
          <p>{nl.library.empty}</p>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.key} className="library-group">
          <h2 className="library-head">
            {g.label} <span className="muted">· {nl.timeline.photos(g.items.length)}</span>
          </h2>
          <div className="library-grid">
            {g.items.map((i) => {
              const p = photos![i]!;
              return (
                <button
                  key={`${p.postId}-${p.assetId}`}
                  type="button"
                  className="library-thumb"
                  onClick={() => setOpen(i)}
                  aria-label={nl.library.openPhoto(p.postTitle)}
                >
                  <img src={mediaUrl(p.assetId, 'thumbnail')} alt="" loading="lazy" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {open !== null && photos && (
        <Lightbox
          photos={ids}
          start={open}
          alt={nl.library.title}
          allowOriginal={(i) => photos[i]?.authorId === me.id}
          onClose={() => setOpen(null)}
          extra={(i) => {
            const p = photos[i];
            return p ? (
              <Link to={`/post/${p.postId}`} className="lightbox-link">
                {p.postTitle}
              </Link>
            ) : null;
          }}
        />
      )}
    </section>
  );
}
