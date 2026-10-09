import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { Alert, Field } from '../components/Field';
import { LazyRichTextEditor } from '../components/LazyRichTextEditor';
import { PhotoPicker } from '../components/PhotoPicker';
import { usePageTitle } from '../components/PageTitle';
import { TravelSharing } from '../components/TravelSharing';
import { nl } from '../i18n/nl';
import { mediaUrl } from '../lib/format';

export function TravelEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  usePageTitle(id ? nl.travelEditor.editTitle : nl.travelEditor.newTitle, { back: id ? `/reizen/${id}` : '/reizen' });
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [coverAssetId, setCoverAssetId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travel, setTravel] = useState<TravelSummary | null>(null);

  useEffect(() => {
    if (!id) return;
    api<{ travel: TravelSummary }>(`/travels/${id}`)
      .then(({ travel }) => {
        setName(travel.name);
        setStartDate(travel.startDate);
        setEndDate(travel.endDate ?? '');
        setDescription(travel.description);
        setCoverAssetId(travel.coverAssetId);
        setTravel(travel);
        setLoaded(true);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(id ? `/travels/${id}` : '/travels', {
        method: id ? 'PUT' : 'POST',
        body: { name, startDate, endDate: endDate || null, description, coverAssetId },
      });
      navigate(id ? `/reizen/${id}` : '/reizen', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!loaded && !error) return <p className="muted center">{nl.loading}</p>;

  return (
    <section className="page">
      <form className="card stack" onSubmit={submit}>
        <Field
          label={nl.travelEditor.name}
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
        />
        <div className="field-row">
          <Field
            label={nl.travelEditor.startDate}
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <Field
            label={nl.travelEditor.endDate}
            name="endDate"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <span className="field-hint">{nl.travelEditor.endDateHint}</span>
        <div className="field">
          <span className="field-label">{nl.travelEditor.description}</span>
          <LazyRichTextEditor
            id="description"
            aria-label={nl.travelEditor.description}
            minHeight={120}
            value={description}
            onChange={setDescription}
            maxLength={20_000}
          />
          <span className="field-hint">{nl.richText.hint}</span>
        </div>
        <div className="field">
          <span className="field-label">{nl.travelEditor.cover}</span>
          {coverAssetId && (
            <img className="cover-preview" src={mediaUrl(coverAssetId, 'preview')} alt={nl.travelEditor.cover} />
          )}
          <div className="row-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setPicking(true)}>
              {nl.travelEditor.chooseCover}
            </button>
            {coverAssetId && (
              <button type="button" className="btn btn-small btn-danger" onClick={() => setCoverAssetId(null)}>
                {nl.travelEditor.removeCover}
              </button>
            )}
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? nl.common.saving : nl.common.save}
        </button>
      </form>
      {travel?.canManage && <TravelSharing travel={travel} onChange={setTravel} />}
      {picking && (
        <PhotoPicker
          initial={coverAssetId ? [coverAssetId] : []}
          max={1}
          onClose={() => setPicking(false)}
          onDone={(ids) => {
            setCoverAssetId(ids[0] ?? null);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
