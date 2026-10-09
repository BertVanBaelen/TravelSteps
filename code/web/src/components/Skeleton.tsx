import { nl } from '../i18n/nl';

/** A grey shimmering placeholder block. */
export function Skeleton({ width, height = '1em', round = false }: { width?: string; height?: string; round?: boolean }) {
  return <span className={`skeleton${round ? ' skeleton-round' : ''}`} style={{ width, height }} />;
}

/** Placeholder cards while a list is loading; announced as "Laden…" to screen readers. */
export function SkeletonCards({ count = 3, media = false }: { count?: number; media?: boolean }) {
  return (
    <div className="skeleton-list" role="status" aria-label={nl.loading}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton-card" aria-hidden>
          <div className="skeleton-row">
            <Skeleton width="24px" height="24px" round />
            <Skeleton width="40%" />
          </div>
          <Skeleton width="70%" height="1.3em" />
          <Skeleton width="90%" />
          {media && <Skeleton width="100%" height="160px" />}
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a photo grid. */
export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="skeleton-grid" role="status" aria-label={nl.loading}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width="100%" height="100%" />
      ))}
    </div>
  );
}

/** Placeholder for a map. */
export function SkeletonBlock({ height = '300px' }: { height?: string }) {
  return (
    <div role="status" aria-label={nl.loading}>
      <Skeleton width="100%" height={height} />
    </div>
  );
}

/** Placeholder for a couple of comments. */
export function CommentSkeleton() {
  return (
    <div className="skeleton-list" role="status" aria-label={nl.loading}>
      {[0, 1].map((i) => (
        <div key={i} className="skeleton-row" aria-hidden>
          <Skeleton width="34px" height="34px" round />
          <Skeleton width="60%" height="2.2em" />
        </div>
      ))}
    </div>
  );
}
