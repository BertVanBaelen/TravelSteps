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
});
