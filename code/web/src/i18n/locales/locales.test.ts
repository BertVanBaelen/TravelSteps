import { describe, expect, it } from 'vitest';
import { en } from './en';
import { nl } from './nl';

function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}()${value.length}`];
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((k) => shape((value as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return [`${path}:${typeof value}`];
}

describe('locales', () => {
  it('en and nl have the same keys, value kinds and function arities', () => {
    expect(shape(en)).toEqual(shape(nl));
  });

  it('has no empty texts', () => {
    for (const locale of [nl, en]) {
      expect(shape(locale).filter((k) => k.endsWith(':string'))).not.toHaveLength(0);
      const empty: string[] = [];
      const walk = (v: unknown, p: string) => {
        if (typeof v === 'string' && !v.trim()) empty.push(p);
        else if (v && typeof v === 'object')
          for (const [k, c] of Object.entries(v)) walk(c, `${p}.${k}`);
      };
      walk(locale, '');
      expect(empty).toEqual([]);
    }
  });

  it('plural and interpolation helpers work in both languages', () => {
    expect(nl.timeline.photos(1)).toBe('1 foto');
    expect(en.timeline.photos(1)).toBe('1 photo');
    expect(en.timeline.photos(3)).toBe('3 photos');
    expect(en.likes.likedBy(['Oma', 'Bert'], 2)).toBe('Liked by Oma, Bert and 2 others');
  });

  it('builds the V3 sentences with the right verb and plural', () => {
    expect(nl.likes.likeThis(['Marleen', 'Jonas', 'Lies'], 0)).toBe(
      'Marleen, Jonas en Lies vinden dit leuk',
    );
    expect(nl.likes.likeThis([nl.likes.youSubject], 0)).toBe('Jij vindt dit leuk');
    expect(nl.likes.likeThis(['Marleen', nl.likes.youSubject], 0)).toBe(
      'Marleen en jij vinden dit leuk',
    );
    expect(en.likes.likeThis([en.likes.youSubject], 0)).toBe('You like this');
    expect(en.likes.likeThis(['Marleen'], 0)).toBe('Marleen likes this');
    expect(en.likes.likeThis(['Marleen'], 2)).toBe('Marleen and 2 others like this');
    expect(nl.journey.summary(7, 2, 4)).toBe('7 dagen met een stap · 2 rustdagen · 4 nog leeg');
    expect(en.journey.summary(1, 0, 1)).toBe('1 day with a step · 1 still empty');
    expect(nl.journey.dayRange(7, 8)).toBe('Dag 7 en 8');
    expect(nl.journey.dayRange(3, 5)).toBe('Dag 3 t/m 5');
    expect(nl.timeline.daysEarlier(2)).toBe('2 dagen eerder');
    expect(nl.post.day(6, 'do 9 juli')).toBe('Dag 6 · do 9 juli');
  });
});
