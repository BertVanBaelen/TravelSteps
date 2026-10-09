import type { TravelSummary } from '@travelsteps/shared';
import { nl } from '../i18n/nl';
import { formatRange, mediaUrl } from '../lib/format';
import { TravelIcon } from './icons';
import { Listbox, type ListboxOption } from './Listbox';
import { PageStart } from './PageTitle';

interface Props {
  travels: TravelSummary[];
  /** Selected travel ID, or `allValue` for all travels. */
  value: string;
  allValue: string;
  onChange: (id: string) => void;
  /** Colour swatch per travel (map colours). */
  colorFor?: (id: string) => string;
}

/** Cover thumbnail of a travel (or a travel icon), optionally with a map colour swatch. */
export function TravelThumb({ travel, color, small }: { travel: TravelSummary; color?: string; small?: boolean }) {
  const className = `travel-thumb${small ? ' travel-thumb-small' : ''}`;
  const style = color ? { ['--swatch' as string]: color } : undefined;
  return travel.coverAssetId ? (
    <img className={className} src={mediaUrl(travel.coverAssetId, 'thumbnail')} alt="" style={style} />
  ) : (
    <span className={className} aria-hidden style={style}>
      <TravelIcon />
    </span>
  );
}

/** A travel as listbox option: cover, name and dates/counts. */
export function travelOption(t: TravelSummary, colorFor?: (id: string) => string, suffix = ''): ListboxOption {
  return {
    id: t.id,
    label: t.name + suffix,
    meta: `${formatRange(t.startDate, t.endDate, nl.travels.ongoing)} · ${nl.travels.counts(t.postCount, t.photoCount)}`,
    icon: <TravelThumb travel={t} color={colorFor?.(t.id)} />,
    triggerIcon: <TravelThumb travel={t} small />,
  };
}

/** Travel filter in the left of the app header (timeline, map). */
export function TravelPicker({ travels, value, allValue, onChange, colorFor }: Props) {
  const small = (
    <span className="travel-thumb travel-thumb-small" aria-hidden>
      <TravelIcon />
    </span>
  );
  const options: ListboxOption[] = [
    {
      id: allValue,
      label: nl.timeline.allTravels,
      meta: nl.blog.travelCount(travels.length),
      icon: (
        <span className="travel-thumb" aria-hidden>
          <TravelIcon />
        </span>
      ),
      triggerIcon: small,
    },
    ...travels.map((t) => ({ ...travelOption(t, colorFor), triggerIcon: small })),
  ];
  return (
    <PageStart>
      <Listbox
        className="travel-picker"
        title={nl.map.filter}
        options={options}
        selected={value}
        onSelect={onChange}
      />
    </PageStart>
  );
}
