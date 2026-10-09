import { useState } from 'react';
import { EVERYONE, useBlog } from '../blog/BlogContext';
import { useUser } from '../auth/AuthContext';
import { errorMessage } from '../api';
import { nl } from '../i18n/nl';
import { BellIcon } from './icons';

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

  return (
    <div className="blog-bar">
      <label className="blog-label" htmlFor="blog-select">
        {nl.blog.label}
      </label>
      <select id="blog-select" className="select-inline" value={selected} onChange={(e) => select(e.target.value)}>
        <option value={EVERYONE}>{nl.blog.everyone}</option>
        {travellers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id === me.id ? nl.blog.me(t.displayName) : t.displayName}
          </option>
        ))}
      </select>
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
