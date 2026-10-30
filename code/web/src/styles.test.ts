import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRAVEL_COLORS } from '@travelsteps/shared';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

/** Hex tokens from the :root block, with `var(--x)` aliases resolved. */
function tokens(): Map<string, string> {
  const root = css.slice(0, css.indexOf('\n}\n'));
  const raw = new Map<string, string>();
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) raw.set(m[1]!, m[2]!.trim());
  const resolve = (v: string, depth = 0): string => {
    const alias = /^var\(--([a-z0-9-]+)\)$/.exec(v);
    return alias && depth < 5 ? resolve(raw.get(alias[1]!) ?? v, depth + 1) : v;
  };
  return new Map([...raw].map(([k, v]) => [k, resolve(v)]));
}

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? [...n].map((c) => c + c).join('') : n;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('design tokens', () => {
  const t = tokens();
  const get = (name: string) => {
    const v = t.get(name);
    if (!v?.startsWith('#')) throw new Error(`--${name} is not a hex colour: ${v}`);
    return v;
  };

  // Text pairs must reach 4.5:1 (WCAG AA for normal text).
  it.each([
    ['text', 'bg'],
    ['text', 'card'],
    ['muted', 'bg'],
    ['muted', 'card'],
    ['muted', 'surface-2'],
    ['brand', 'card'],
    ['brand-dark', 'brand-tint'],
    ['accent-ink', 'accent-tint'],
    ['accent-ink', 'card'],
    ['danger', 'card'],
    ['danger', 'danger-tint'],
    ['info-ink', 'info-bg'],
    ['warn-ink', 'warn-bg'],
  ])('--%s on --%s has 4.5:1', (fg, bg) => {
    expect(contrast(get(fg), get(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([['brand'], ['brand-dark'], ['count-badge'], ['danger']])(
    'white text on --%s has 4.5:1',
    (bg) => {
      expect(contrast('#ffffff', get(bg))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('control outlines have 3:1 against white', () => {
    expect(contrast(get('control-border'), '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(TRAVEL_COLORS))(
    'travel colour %s has 3:1 against paper and white',
    (_, hex) => {
      expect(contrast(hex, get('bg'))).toBeGreaterThanOrEqual(3);
      expect(contrast(hex, '#ffffff')).toBeGreaterThanOrEqual(3);
    },
  );

  it('has no font size below the 15 px minimum in rem', () => {
    const small = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)]
      .map((m) => Number(m[1]))
      .filter((v) => v < 0.9375);
    // Only avatar initials, numbers in fixed-size map markers and the unread count on the bell
    // stay smaller (the count is repeated in the label for screen readers).
    expect(small.sort()).toEqual([0.55, 0.6, 0.8, 0.8125]);
  });
});
