import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from './icons';

export interface SettingsRow {
  icon: ReactNode;
  title: string;
  /** Current value or short explanation under the title. */
  summary?: ReactNode;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

/** Card with a list of navigation rows (icon, title, summary, chevron) for a settings hub. */
export function SettingsMenu({ title, rows }: { title?: string; rows: SettingsRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="settings-group">
      {title && <h2 className="settings-group-title">{title}</h2>}
      <ul className="card settings-menu">
        {rows.map((r) => {
          const content = (
            <>
              <span className="settings-row-icon" aria-hidden>
                {r.icon}
              </span>
              <span className="settings-row-text">
                <span className="settings-row-title">{r.title}</span>
                {r.summary && <span className="settings-row-summary">{r.summary}</span>}
              </span>
              {r.to && (
                <span className="settings-row-chevron" aria-hidden>
                  <ChevronRight />
                </span>
              )}
            </>
          );
          const cls = `settings-row${r.danger ? ' danger' : ''}`;
          return (
            <li key={r.title}>
              {r.to ? (
                <Link to={r.to} className={cls}>
                  {content}
                </Link>
              ) : (
                <button type="button" className={cls} onClick={r.onClick}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
