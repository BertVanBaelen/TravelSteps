import type { ReactElement } from 'react';
import { useT } from '../i18n';
import type { LineGroup } from '../lib/map';
import { BikeIcon, BoatIcon, CarIcon } from './icons';

const GROUPS: { group: LineGroup; icon: ReactElement }[] = [
  { group: 'own', icon: <BikeIcon /> },
  { group: 'car', icon: <CarIcon /> },
  { group: 'transit', icon: <BoatIcon /> },
];

/** Explains the map line styles with an icon, a sample line and a word (never colour alone). */
export function LineLegend() {
  const msg = useT();
  return (
    <ul className="line-legend" aria-label={msg.map.legend}>
      {GROUPS.map(({ group, icon }) => (
        <li key={group}>
          {icon}
          <span className={`line-sample line-${group}`} aria-hidden />
          {msg.map.lines[group]}
        </li>
      ))}
    </ul>
  );
}
