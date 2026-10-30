import { useEffect, useRef, useState } from 'react';
import type { Traveller, TravelSummary } from '@travelsteps/shared';
import { errorMessage } from '../api';
import { useUser } from '../auth/AuthContext';
import { ALL_TRAVELS, EVERYONE, useBlog } from '../blog/BlogContext';
import { useT } from '../i18n';
import { formatRange } from '../lib/format';
import { isAuthorOf, travelAuthors, travelColor, travelDay } from '../lib/travel';
import { Avatar } from './Avatar';
import { BellIcon, ChevronDown, CloseIcon, TravelIcon, UsersIcon } from './icons';
import { TravelThumb } from './TravelPicker';

/**
 * "What am I looking at": one bar with the chosen travel (or all travels) and whose diary, that
 * opens one sheet with both choices. Replaces the separate blog and travel pickers (V3-2).
 */
export function ContextBar({ whoOnly = false }: { whoOnly?: boolean }) {
  const msg = useT();
  const me = useUser();
  const { travellers, selected, travels, travelId } = useBlog();
  const [open, setOpen] = useState(false);

  if (whoOnly ? !travellers || travellers.length === 0 : !travels || travels.length === 0) {
    return null;
  }
  const person = travellers?.find((t) => t.id === selected);
  const travel = whoOnly ? null : (travels?.find((t) => t.id === travelId) ?? null);
  const who = person?.displayName ?? msg.context.everyoneLower;

  let sub: string;
  if (whoOnly) {
    sub = msg.blog.travelCount(travels?.length ?? 0);
  } else if (travel) {
    const day = travelDay(travel);
    const names = msg.context.names(travelAuthors(travel).map((u) => u.displayName));
    sub = day
      ? `${msg.context.day(day)} · ${names}`
      : `${formatRange(travel.startDate, travel.endDate, msg.travels.ongoing)} · ${names}`;
  } else {
    sub = `${msg.blog.travelCount(travels?.length ?? 0)} · ${who}`;
  }
  const name = whoOnly
    ? person
      ? person.id === me.id
        ? msg.blog.me(person.displayName)
        : person.displayName
      : msg.blog.everyone
    : travel
      ? travel.name
      : msg.timeline.allTravels;
  const thumb = whoOnly ? (
    person ? (
      <Avatar user={person} size="m" />
    ) : (
      <EveryoneAvatar />
    )
  ) : travel ? (
    <TravelThumb travel={travel} color={travelColor(travel)} />
  ) : (
    <AllThumb />
  );

  return (
    <>
      <button
        type="button"
        className="context-bar"
        aria-haspopup="dialog"
        aria-label={msg.context.open(`${name}, ${sub}`)}
        onClick={() => setOpen(true)}
      >
        {thumb}
        <span className="context-text">
          <span className="context-name">{name}</span>
          <span className="context-sub">{sub}</span>
        </span>
        <span className="context-change">{msg.context.change}</span>
        <ChevronDown />
      </button>
      {open && (
        <WhatToSee
          meId={me.id}
          whoOnly={whoOnly}
          onClose={() => setOpen(false)}
          initialWho={selected}
          initialTravel={travelId}
        />
      )}
    </>
  );
}

function AllThumb() {
  return (
    <span className="travel-thumb" aria-hidden>
      <TravelIcon />
    </span>
  );
}

function EveryoneAvatar() {
  return (
    <span className="avatar avatar-m avatar-group" aria-hidden>
      <UsersIcon />
    </span>
  );
}

function WhatToSee({
  meId,
  whoOnly,
  initialWho,
  initialTravel,
  onClose,
}: {
  meId: string;
  whoOnly: boolean;
  initialWho: string;
  initialTravel: string;
  onClose: () => void;
}) {
  const msg = useT();
  const { travellers, allTravels, select, selectTravel, setSubscribed } = useBlog();
  const ref = useRef<HTMLDialogElement>(null);
  const [who, setWho] = useState(initialWho);
  const [travel, setTravel] = useState(initialTravel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const options: TravelSummary[] =
    allTravels?.filter((t) => who === EVERYONE || isAuthorOf(t, who)) ?? [];
  // Switching to another diary keeps the travel only when it is part of it.
  const travelChoice = options.some((t) => t.id === travel) ? travel : ALL_TRAVELS;
  const count =
    travelChoice === ALL_TRAVELS
      ? options.reduce((n, t) => n + t.postCount, 0)
      : (options.find((t) => t.id === travelChoice)?.postCount ?? 0);
  const person = travellers?.find((t) => t.id === who);

  function apply() {
    select(who);
    if (!whoOnly) selectTravel(travelChoice);
    onClose();
  }

  async function toggleFollow(t: Traveller) {
    setBusy(true);
    setError(null);
    try {
      await setSubscribed(t.id, !t.subscribed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="context-sheet"
      aria-labelledby="context-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="context-sheet-head">
        <h2 id="context-title">{msg.context.title}</h2>
        <button
          type="button"
          className="icon-btn context-close"
          aria-label={msg.common.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="context-sheet-body">
        {travellers && travellers.length > 0 && (
          <fieldset className="choice-group">
            <legend>{msg.context.who}</legend>
            <label className="choice-row">
              <EveryoneAvatar />
              <span className="choice-text">
                <span className="choice-name">{msg.blog.everyone}</span>
              </span>
              <input
                type="radio"
                name="context-who"
                checked={who === EVERYONE}
                onChange={() => setWho(EVERYONE)}
              />
            </label>
            {travellers.map((t) => (
              <label key={t.id} className="choice-row">
                <Avatar user={t} size="m" />
                <span className="choice-text">
                  <span className="choice-name">
                    {t.displayName}
                    {t.id === meId && <span className="muted"> ({msg.blog.you})</span>}
                  </span>
                </span>
                <input
                  type="radio"
                  name="context-who"
                  checked={who === t.id}
                  onChange={() => setWho(t.id)}
                />
              </label>
            ))}
            {person && person.id !== meId && (
              <button
                type="button"
                className={`follow-toggle${person.subscribed ? ' on' : ''}`}
                aria-pressed={person.subscribed}
                disabled={busy}
                onClick={() => void toggleFollow(person)}
              >
                <BellIcon filled={person.subscribed} />
                {msg.context.follow(person.displayName)}
              </button>
            )}
            {error && <p className="alert alert-error">{error}</p>}
          </fieldset>
        )}
        {!whoOnly && (
          <fieldset className="choice-group">
            <legend>{msg.context.which}</legend>
            <label className="choice-row">
              <AllThumb />
              <span className="choice-text">
                <span className="choice-name">{msg.timeline.allTravels}</span>
                <span className="choice-meta">{msg.blog.travelCount(options.length)}</span>
              </span>
              <input
                type="radio"
                name="context-travel"
                checked={travelChoice === ALL_TRAVELS}
                onChange={() => setTravel(ALL_TRAVELS)}
              />
            </label>
            {options.map((t) => {
              const day = travelDay(t);
              return (
                <label key={t.id} className="choice-row">
                  <TravelThumb travel={t} color={travelColor(t)} />
                  <span className="choice-text">
                    <span className="choice-name">{t.name}</span>
                    {day ? (
                      <span className="choice-meta now">{msg.context.nowDay(day)}</span>
                    ) : (
                      <span className="choice-meta">
                        {formatRange(t.startDate, t.endDate, msg.travels.ongoing)} ·{' '}
                        {msg.travels.counts(t.postCount, t.photoCount)}
                      </span>
                    )}
                  </span>
                  <input
                    type="radio"
                    name="context-travel"
                    checked={travelChoice === t.id}
                    onChange={() => setTravel(t.id)}
                  />
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
      <div className="context-sheet-foot">
        <button type="button" className="btn btn-primary btn-block" onClick={apply}>
          {whoOnly ? msg.context.showTravels(options.length) : msg.context.show(count)}
        </button>
      </div>
    </dialog>
  );
}
