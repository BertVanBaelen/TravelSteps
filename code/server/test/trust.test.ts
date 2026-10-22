import { describe, expect, it } from 'vitest';
import { canUseAuthorRights, type AuthorRightsDeps } from '../src/trust/permissions.js';
import { attachmentHeader } from '../src/routes/immich.js';
import type { Actor } from '../src/content/store.js';

const actor = (id: string, role: Actor['role'] = 'viewer') => ({ id, role }) as Actor;

function deps(trusted: [string, string][], visible: [string, string][]): AuthorRightsDeps {
  return {
    isTrusted: (owner, user) => trusted.some(([o, u]) => o === owner && u === user),
    canView: (a, travel) =>
      a.role === 'admin' || visible.some(([u, t]) => u === a.id && t === travel),
  };
}

describe('canUseAuthorRights', () => {
  const d = deps(
    [['piet', 'oma']],
    [
      ['oma', 'ijsland'],
      ['jan', 'ijsland'],
    ],
  );

  it('geeft rechten aan de auteur en de beheerder', () => {
    expect(canUseAuthorRights(d, actor('piet', 'traveller'), 'piet', 'ijsland')).toBe(true);
    expect(canUseAuthorRights(d, actor('bert', 'admin'), 'piet', 'noorwegen')).toBe(true);
    expect(canUseAuthorRights(d, actor('bert', 'admin'), null, 'ijsland')).toBe(true);
  });

  it('geeft rechten aan vertrouwde personen met zicht op de reis', () => {
    expect(canUseAuthorRights(d, actor('oma'), 'piet', 'ijsland')).toBe(true);
    expect(canUseAuthorRights(d, actor('oma'), 'piet', 'noorwegen')).toBe(false);
  });

  it('weigert anderen', () => {
    expect(canUseAuthorRights(d, actor('jan'), 'piet', 'ijsland')).toBe(false);
    expect(canUseAuthorRights(d, actor('oma'), 'kees', 'ijsland')).toBe(false);
    expect(canUseAuthorRights(d, actor('oma'), null, 'ijsland')).toBe(false);
  });
});

describe('attachmentHeader', () => {
  it('gebruikt de originele bestandsnaam of valt terug op het asset-id', () => {
    expect(attachmentHeader('IMG_1.HEIC', 'a1', 'image/heic')).toBe(
      `attachment; filename="IMG_1.HEIC"; filename*=UTF-8''IMG_1.HEIC`,
    );
    expect(attachmentHeader(null, 'a1', 'image/png')).toBe(
      `attachment; filename="a1.png"; filename*=UTF-8''a1.png`,
    );
    expect(attachmentHeader('map/Zoë "x".jpg', 'a1', null)).toBe(
      `attachment; filename="Zo_ _x_.jpg"; filename*=UTF-8''Zo%C3%AB%20%22x%22.jpg`,
    );
  });
});
