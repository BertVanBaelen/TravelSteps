import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  text: ReactNode;
  action?: ReactNode;
}

/** Friendly "nothing here yet" block with an optional call to action. */
export function EmptyState({ icon, text, action }: Props) {
  return (
    <div className="card empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}
