import { useState } from 'react';
import type { Traveller } from '@travelsteps/shared';
import { EVERYONE, useBlog } from '../blog/BlogContext';
import { useUser } from '../auth/AuthContext';
import { errorMessage } from '../api';
import { nl } from '../i18n/nl';
import { Avatar } from './Avatar';
import { BellIcon, UsersIcon } from './icons';
import { Listbox, type ListboxOption } from './Listbox';

interface Option {
  id: string;
  traveller: Traveller | null;
}

/** Header bar: whose blog to show, plus a bell to get notifications about that traveller. */
export function BlogBar() {
  const me = useUser();
  const { travellers, selected, select, setSubscribed } = useBlog();
  const [busy, setBusy] = useState(false);

  if (!travellers || travellers.length === 0) return null;
  const current = travellers.find((t) => t.id === selected);

  async function toggle() {
    if (!current) return;
    setBusy(true);
    try {
      await setSubscribed(current.id, !current.subscribed);
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const options: Option[] = [{ id: EVERYONE, traveller: null }, ...travellers.map((t) => ({ id: t.id, traveller: t }))];

  return (
    <div className="blog-bar">
      <Listbox
        className="blog-select"
        title={nl.blog.choose}
        options={options.map((o) => toListbox(o, me.id))}
        selected={current ? current.id : EVERYONE}
        onSelect={select}
      />
      {current && current.id !== me.id && (
        <button
          type="button"
          className={`icon-btn blog-bell${current.subscribed ? ' on' : ''}`}
          aria-pressed={current.subscribed}
          aria-label={current.subscribed ? nl.blog.unsubscribe(current.displayName) : nl.blog.subscribe(current.displayName)}
          title={current.subscribed ? nl.blog.unsubscribe(current.displayName) : nl.blog.subscribe(current.displayName)}
          disabled={busy}
          onClick={() => void toggle()}
        >
          <BellIcon filled={current.subscribed} />
        </button>
      )}
    </div>
  );
}

function toListbox(o: Option, meId: string): ListboxOption {
  const t = o.traveller;
  return {
    id: o.id,
    label: label(o, meId),
    name: t ? (
      <>
        {t.displayName}
        {t.id === meId && <span className="badge">{nl.blog.you}</span>}
      </>
    ) : (
      nl.blog.everyone
    ),
    meta: t ? (typeof t.travelCount === 'number' ? nl.blog.travelCount(t.travelCount) : undefined) : nl.blog.everyoneHint,
    icon: <OptionAvatar option={o} size="s" />,
    triggerIcon: <OptionAvatar option={o} size="xs" />,
  };
}

function label(o: Option, meId: string): string {
  if (!o.traveller) return nl.blog.everyone;
  return o.traveller.id === meId ? nl.blog.me(o.traveller.displayName) : o.traveller.displayName;
}

function OptionAvatar({ option, size }: { option: Option; size: 'xs' | 's' }) {
  if (option.traveller) return <Avatar user={option.traveller} size={size} />;
  return (
    <span className={`avatar avatar-${size} avatar-group`} aria-hidden>
      <UsersIcon />
    </span>
  );
}