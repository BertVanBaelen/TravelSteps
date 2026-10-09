import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PostDetail, PostInput, RoutePreview, TravelSummary } from '@travelsteps/shared';
import { ApiError, api, errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { Alert, Field, SelectField } from '../components/Field';
import { LazyRichTextEditor } from '../components/LazyRichTextEditor';
import { LocationEditor, normalizeRoute, type RouteValue } from '../components/LocationEditor';
import { Markdown } from '../components/Markdown';
import { usePageTitle } from '../components/PageTitle';
import { PhotoPicker } from '../components/PhotoPicker';
import { SelectedPhotos } from '../components/SelectedPhotos';
import { StatsEditor, formToStats, statsToForm, type StatsForm } from '../components/StatsEditor';
import { nl } from '../i18n/nl';
import { formatNumber, fromLocalInput, parseNumber, toLocalInput } from '../lib/format';
import { db, newPostId, useOnline, withTimeout } from '../offline/db';
import { queuePost, savePost } from '../offline/sync';
import { useConfirm } from '../components/ConfirmDialog';

const EMPTY_ROUTE: RouteValue = { locations: [], segments: [], arrival: { mode: 'lopen' } };
/** Max wait for local (IndexedDB) reads before the editor continues without them. */
const LOCAL_TIMEOUT_MS = 2000;

/** The most recent ongoing travel the user may post in, else the newest one. */
function defaultTravel(travels: TravelSummary[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const postable = travels.filter((t) => t.canPost).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    postable.find((t) => t.startDate <= today && (!t.endDate || t.endDate >= today))?.id ??
    postable[0]?.id ??
    ''
  );
}

interface Suggestion {
  afstand?: number;
  hoogtemeters?: number;
}

export function PostEditorPage() {
  const me = useUser();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const online = useOnline();
  const confirm = useConfirm();
  const conceptId = search.get('concept');
  // Existing post being edited, or a (restored) draft of a new post.
  const [postId] = useState(() => params.id ?? conceptId ?? newPostId());
  const isNew = !params.id;
  usePageTitle(isNew ? nl.editor.newTitle : nl.editor.editTitle, { back: isNew ? '/' : `/post/${postId}` });

  const [travels, setTravels] = useState<TravelSummary[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | undefined>();
  const [localNotice, setLocalNotice] = useState(false);

  const [travelId, setTravelId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => toLocalInput(new Date().toISOString()));
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [route, setRoute] = useState<RouteValue>(EMPTY_ROUTE);
  const [stats, setStats] = useState<StatsForm>(() => statsToForm({ custom: [] }));
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [preview, setPreview] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  function applyInput(input: PostInput, statsForm?: StatsForm) {
    if (input.travelId) setTravelId(input.travelId);
    setTitle(input.title);
    setDate(toLocalInput(input.date));
    setBody(input.body ?? '');
    setPhotos(input.photos ?? []);
    setRoute(
      normalizeRoute({
        locations: input.locations ?? [],
        segments: input.segments ?? [],
        arrival: input.arrival ?? null,
      }),
    );
    setStats(statsForm ?? statsToForm({ ...input.stats, custom: input.stats?.custom ?? [] }));
    setBaseUpdatedAt(input.baseUpdatedAt);
  }

  async function loadServer(): Promise<void> {
    const { post } = await api<{ post: PostDetail }>(`/posts/${postId}`);
    applyInput({ ...post, baseUpdatedAt: post.updatedAt });
  }

  useEffect(() => {
    let cancelled = false;
    api<{ travels: TravelSummary[] }>('/travels')
      .then((r) => {
        if (cancelled) return;
        setTravels(r.travels);
        if (isNew) setTravelId((t) => t || defaultTravel(r.travels));
      })
      .catch(() => setTravels((t) => t ?? []));

    (async () => {
      // A local version (draft or queued) wins over the server version. Local storage must never
      // block the editor: on errors or when it hangs, continue without the local version.
      const local = await withTimeout(
        Promise.all([db.drafts.get(postId), db.outbox.get(postId)]).then(([d, o]) => d ?? o),
        LOCAL_TIMEOUT_MS,
        undefined,
      ).catch((err: unknown) => {
        console.warn('Lokaal concept kon niet worden gelezen', err);
        return undefined;
      });
      if (cancelled) return;
      if (local) {
        applyInput(local.input, 'statsForm' in local ? local.statsForm : undefined);
        if (!isNew) setLocalNotice(true);
      } else if (!isNew) {
        await loadServer();
      }
      if (!cancelled) setLoaded(true);
    })().catch((err) => {
      if (!cancelled) setError(errorMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildInput(strict: boolean): PostInput {
    let parsedStats;
    try {
      parsedStats = formToStats(stats);
    } catch (err) {
      if (strict) throw err;
      parsedStats = { custom: [] };
    }
    return {
      travelId: travelId || undefined,
      title,
      date: date ? fromLocalInput(date) : new Date().toISOString(),
      body,
      photos,
      locations: route.locations,
      segments: route.segments,
      arrival: route.arrival,
      stats: parsedStats,
      ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
    };
  }

  // Autosave a local draft while writing.
  const routeSig = [route.locations, route.segments.map((s) => s.mode), route.arrival?.mode ?? null];
  const snapshot = JSON.stringify([travelId, title, date, body, photos, routeSig, stats]);
  const first = useRef(true);
  /** Set once the post is published or queued: no more autosaves or URL changes. */
  const done = useRef(false);
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!loaded || done.current) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      if (done.current) return;
      const save = db.drafts
        .put({ id: postId, isNew, input: buildInput(false), statsForm: stats, savedAt: Date.now() })
        .then(() => {
          if (isNew && !conceptId && !done.current) setSearch({ concept: postId }, { replace: true });
        })
        .catch((err: unknown) => console.warn('Concept kon niet lokaal worden bewaard', err));
      pendingSave.current = save;
    }, 800);
    return () => window.clearTimeout(t);
  }, [snapshot, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Removes the local draft/outbox copy in the background (after a pending autosave). */
  function forgetLocal() {
    void pendingSave.current
      .then(() => Promise.all([db.drafts.delete(postId), db.outbox.delete(postId)]))
      .catch((err: unknown) => console.warn('Lokaal concept kon niet worden verwijderd', err));
  }

  function onRoute(p: RoutePreview) {
    if (route.locations.length < 2 && p.distanceKm === 0) {
      setSuggestion(null);
      return;
    }
    const km = Math.round(p.distanceKm * 10) / 10;
    const m = Math.round(p.ascentM);
    const next: Suggestion = {};
    const fixed = { ...stats.fixed };
    let filled = false;
    for (const [key, val] of [
      ['afstand', km],
      ['hoogtemeters', m],
    ] as const) {
      if (val <= 0) continue;
      const current = fixed[key].trim();
      if (!current) {
        fixed[key] = String(val).replace('.', ',');
        filled = true;
      } else if (parseNumber(current) !== val) {
        next[key] = val;
      }
    }
    if (filled) setStats((s) => ({ ...s, fixed: { ...s.fixed, ...pick(fixed, s.fixed) } }));
    setSuggestion(next.afstand !== undefined || next.hoogtemeters !== undefined ? next : null);
  }

  function takeSuggestion() {
    if (!suggestion) return;
    setStats((s) => ({
      ...s,
      fixed: {
        ...s.fixed,
        ...(suggestion.afstand !== undefined ? { afstand: String(suggestion.afstand).replace('.', ',') } : {}),
        ...(suggestion.hoogtemeters !== undefined ? { hoogtemeters: String(suggestion.hoogtemeters) } : {}),
      },
    }));
    setSuggestion(null);
  }

  /** Queues the post locally; false when local storage does not respond. */
  async function queueLocally(input: PostInput): Promise<boolean> {
    const ok = await withTimeout(
      pendingSave.current.then(() => queuePost(postId, isNew, input)).then(() => true),
      LOCAL_TIMEOUT_MS * 2,
      false,
    ).catch(() => false);
    if (ok) {
      done.current = true;
      navigate('/', { replace: true });
    } else {
      setError(nl.sync.localFailed);
      setBusy(false);
    }
    return ok;
  }

  async function finish(input: PostInput) {
    setBusy(true);
    setError(null);
    setConflict(false);
    if (!navigator.onLine) {
      await queueLocally(input);
      return;
    }
    try {
      const post = await savePost(postId, isNew, input);
      // Navigate right away; cleaning up the local copy must not hold up the user.
      done.current = true;
      forgetLocal();
      navigate(`/post/${post.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
        await queueLocally(input);
        return;
      }
      if (err instanceof ApiError && err.status === 409 && err.code === 'CONFLICT') setConflict(true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    let input: PostInput;
    try {
      input = buildInput(true);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    void finish(input);
  }

  function keepMine() {
    setBaseUpdatedAt(undefined);
    const input = buildInput(true);
    delete input.baseUpdatedAt;
    void finish(input);
  }

  async function takeServer() {
    if (!(await confirm(nl.sync.confirmTakeServer))) return;
    await withTimeout(Promise.all([db.drafts.delete(postId), db.outbox.delete(postId)]), LOCAL_TIMEOUT_MS, null).catch(
      () => null,
    );
    setConflict(false);
    setError(null);
    setLocalNotice(false);
    first.current = true;
    await loadServer().catch((err) => setError(errorMessage(err)));
  }

  async function discardLocal() {
    if (!(await confirm({ message: nl.sync.confirmDiscard, confirmLabel: nl.sync.discard, danger: true }))) return;
    await withTimeout(Promise.all([db.drafts.delete(postId), db.outbox.delete(postId)]), LOCAL_TIMEOUT_MS, null).catch(
      () => null,
    );
    setLocalNotice(false);
    first.current = true;
    await loadServer().catch((err) => setError(errorMessage(err)));
  }

  if (!loaded && !error) return <p className="muted center">{nl.loading}</p>;
  const postable = travels?.filter((t) => t.canPost || t.id === travelId) ?? null;
  if (postable && postable.length === 0) {
    return (
      <section className="page">
        <div className="card empty">
          <p>{nl.timeline.noTravel}</p>
          <Link to="/reizen/nieuw" className="btn btn-primary">
            {nl.travels.new}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      {localNotice && (
        <Alert kind="info">
          {nl.sync.localVersion}{' '}
          <button type="button" className="btn-text" onClick={() => void discardLocal()}>
            {nl.sync.discardLocal}
          </button>
        </Alert>
      )}
      {!online && <Alert kind="info">{nl.sync.offlineEditor}</Alert>}
      <form className="stack" onSubmit={submit}>
        <div className="card stack">
          {postable && postable.length > 1 && (
            <SelectField
              label={nl.editor.travel}
              name="travelId"
              value={travelId}
              onChange={(e) => setTravelId(e.target.value)}
            >
              {postable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.owner.id !== me.id ? ` (${t.owner.displayName})` : ''}
                </option>
              ))}
            </SelectField>
          )}
          <Field
            label={nl.editor.title}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            required
          />
          <Field
            label={nl.editor.date}
            name="date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <div className="field">
            <div className="field-head">
              <span className="field-label">{nl.editor.body}</span>
              <div className="segmented">
                <button type="button" className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
                  {nl.editor.write}
                </button>
                <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
                  {nl.editor.preview}
                </button>
              </div>
            </div>
            {preview ? (
              <div className="markdown-preview">
                {body.trim() ? <Markdown>{body}</Markdown> : <p className="muted">{nl.editor.previewEmpty}</p>}
              </div>
            ) : (
              <LazyRichTextEditor
                id="body"
                aria-label={nl.editor.body}
                minHeight={220}
                value={body}
                onChange={setBody}
                maxLength={50_000}
              />
            )}
            <span className="field-hint">{nl.richText.hint}</span>
          </div>
        </div>

        <div className="card stack">
          <h2>{nl.editor.photos}</h2>
          <SelectedPhotos photos={photos} onChange={setPhotos} />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPicking(true)}
            disabled={!online}
          >
            {nl.editor.addPhotos}
          </button>
          {!online && <p className="muted">{nl.sync.photosOnlineOnly}</p>}
        </div>

        <div className="card stack">
          <h2>{nl.locations.title}</h2>
          <LocationEditor
            value={route}
            onChange={setRoute}
            travelId={travelId}
            postId={isNew ? undefined : postId}
            date={date ? fromLocalInput(date) : new Date().toISOString()}
            photos={photos}
            onRoute={onRoute}
          />
        </div>

        <div className="card stack">
          <h2>{nl.editor.stats}</h2>
          <p className="muted">{nl.editor.statsHint}</p>
          {suggestion && (
            <Alert kind="info">
              {nl.locations.suggestion(
                suggestion.afstand !== undefined ? `${formatNumber(suggestion.afstand)} km` : null,
                suggestion.hoogtemeters !== undefined ? `${formatNumber(suggestion.hoogtemeters)} m` : null,
              )}{' '}
              <button type="button" className="btn-text" onClick={takeSuggestion}>
                {nl.locations.takeOver}
              </button>
            </Alert>
          )}
          <StatsEditor value={stats} onChange={setStats} />
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        {conflict && (
          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={keepMine} disabled={busy}>
              {nl.sync.keepMine}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void takeServer()} disabled={busy}>
              {nl.sync.takeServer}
            </button>
          </div>
        )}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? nl.common.saving : !online ? nl.sync.saveOffline : isNew ? nl.editor.publish : nl.common.save}
        </button>
      </form>

      {picking && (
        <PhotoPicker
          initial={photos}
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            setPhotos(ids);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}

/** Only the keys that were empty in `current` (so typing in the meantime is never overwritten). */
function pick(filled: StatsForm['fixed'], current: StatsForm['fixed']): Partial<StatsForm['fixed']> {
  const out: Partial<StatsForm['fixed']> = {};
  for (const key of ['afstand', 'hoogtemeters'] as const) {
    if (!current[key].trim() && filled[key]) out[key] = filled[key];
  }
  return out;
}
