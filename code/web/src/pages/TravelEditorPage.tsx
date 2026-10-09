import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TravelSummary } from '@travelsteps/shared';
import { api, errorMessage } from '../api';
import { useCelebrate } from '../components/Celebration';
import { Alert, Field } from '../components/Field';
import { DateField } from '../components/DateTimePicker';
import { LazyRichTextEditor } from '../components/LazyRichTextEditor';
import { PhotoPicker } from '../components/PhotoPicker';
import { usePageTitle } from '../components/PageTitle';
import { TravelSharing } from '../components/TravelSharing';
import { SkeletonCards } from '../components/Skeleton';
import { nl } from '../i18n/nl';

import { mediaUrl } from '../lib/format';
import { CalendarIcon, CalendarRangeIcon, ImageAddIcon, SaveIcon, TrashIcon } from '../components/icons';

export function TravelEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const celebrate = useCelebrate();
  usePageTitle(id ? nl.travelEditor.editTitle : nl.travelEditor.newTitle, { back: id ? `/reizen/${id}` : '/reizen' });
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [oneDay, setOneDay] = useState(false);
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
        setOneDay(travel.endDate === travel.startDate);
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
    // A new travel first gets its full-screen plane; only then is it created.
    if (!id) await celebrate('travel');
    try {
      await api(id ? `/travels/${id}` : '/travels', {
        method: id ? 'PUT' : 'POST',
        body: { name, startDate, endDate: oneDay ? startDate : endDate || null, description, coverAssetId },
      });
      navigate(id ? `/reizen/${id}` : '/reizen', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!loaded && !error) return <SkeletonCards count={1} />;

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
        <div className="field">
          <span className="field-label" id="duration-label">
            {nl.travelEditor.duration}
          </span>
          <div className="segmented segmented-wide" role="group" aria-labelledby="duration-label">
            <button
              type="button"
              className={oneDay ? 'active' : ''}
              aria-pressed={oneDay}
              onClick={() => setOneDay(true)}
            >
              <CalendarIcon /> {nl.travelEditor.oneDay}
            </button>
            <button
              type="button"
              className={!oneDay ? 'active' : ''}
              aria-pressed={!oneDay}
              onClick={() => {
                setOneDay(false);
                if (endDate === startDate) setEndDate('');
              }}
            >
              <CalendarRangeIcon /> {nl.travelEditor.multipleDays}
            </button>
          </div>
        </div>
        {oneDay ? (
          <DateField label={nl.travelEditor.date} name="startDate" value={startDate} onChange={setStartDate} />
        ) : (
          <>
            <div className="field-row">
              <DateField
                label={nl.travelEditor.startDate}
                name="startDate"
                value={startDate}
                onChange={setStartDate}
              />
              <DateField
                label={nl.travelEditor.endDate}
                name="endDate"
                value={endDate}
                min={startDate}
                emptyLabel={nl.dateTime.noEndDate}
                onChange={setEndDate}
              />
            </div>
            <span className="field-hint">{nl.travelEditor.endDateHint}</span>
          </>
        )}
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
              <ImageAddIcon />
              {nl.travelEditor.chooseCover}
            </button>
            {coverAssetId && (
              <button type="button" className="btn btn-small btn-danger" onClick={() => setCoverAssetId(null)}>
                <TrashIcon />
                {nl.travelEditor.removeCover}
              </button>
            )}
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <SaveIcon />
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
