import type { TravelSummary } from '@travelsteps/shared';
import { messages } from '../i18n';
import { formatRange, mediaUrl } from '../lib/format';
import { travelColor } from '../lib/travel';
import { TravelIcon } from './icons';
import type { ListboxOption } from './Listbox';

/** Cover thumbnail of a travel (or a travel icon), optionally with a map colour swatch. */
export function TravelThumb({
  travel,
  color,
  small,
}: {
  travel: TravelSummary;
  color?: string;
  small?: boolean;
}) {
  const className = `travel-thumb${small ? ' travel-thumb-small' : ''}`;
  const style = color ? { ['--swatch' as string]: color } : undefined;
  return travel.coverAssetId ? (
    <img
      className={className}
      src={mediaUrl(travel.coverAssetId, 'thumbnail')}
      alt=""
      style={style}
    />
  ) : (
    <span className={className} aria-hidden style={style}>
      <TravelIcon />
    </span>
  );
}

/** A travel as listbox option: cover, name and dates/counts. */
export function travelOption(t: TravelSummary, suffix = ''): ListboxOption {
  return {
    id: t.id,
    label: t.name + suffix,
    meta: `${formatRange(t.startDate, t.endDate, messages().travels.ongoing)} · ${messages().travels.counts(t.postCount, t.photoCount)}`,
    icon: <TravelThumb travel={t} color={travelColor(t)} />,
    triggerIcon: <TravelThumb travel={t} small />,
  };
}
