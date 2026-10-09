import type { ReactElement } from 'react';
import { TRANSPORT_MODES, type TransportMode } from '@travelsteps/shared';
import { nl } from '../i18n/nl';
import { BikeIcon, BoatIcon, CarIcon, PlaneIcon, TrainIcon, WalkIcon } from './icons';
import type { ListboxOption } from './Listbox';

const ICONS: Record<TransportMode, () => ReactElement> = {
  lopen: WalkIcon,
  fietsen: BikeIcon,
  auto: CarIcon,
  trein: TrainIcon,
  vliegtuig: PlaneIcon,
  boot: BoatIcon,
};

export function ModeIcon({ mode }: { mode: TransportMode }) {
  const Icon = ICONS[mode];
  return <Icon />;
}

/** Transport modes as listbox options, each with its icon. */
export const modeOptions: ListboxOption[] = TRANSPORT_MODES.map((m) => ({
  id: m,
  label: nl.modes[m],
  icon: (
    <span className="picker-icon">
      <ModeIcon mode={m} />
    </span>
  ),
}));