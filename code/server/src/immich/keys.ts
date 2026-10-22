import crypto from 'node:crypto';
import type { UserRepository } from '../users/repository.js';
import { ImmichClient } from './client.js';
import { HttpError } from '../errors.js';

const VERSION = 'v1';

/** Encrypts personal Immich API keys at rest (AES-256-GCM, key derived from the session secret). */
export class KeyBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(crypto.hkdfSync('sha256', secret, 'travelsteps', 'immich-api-key', 32));
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  /** null when the value can't be decrypted (e.g. the session secret changed). */
  decrypt(value: string): string | null {
    const [version, iv, tag, data] = value.split('.');
    if (version !== VERSION || !iv || !tag || !data) return null;
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}

/** Immich access with the personal API key of each traveller (one shared Immich URL). */
export class ImmichService {
  private readonly clients = new Map<string, { enc: string; client: ImmichClient }>();

  constructor(
    readonly url: string | undefined,
    private readonly users: UserRepository,
    private readonly box: KeyBox,
  ) {}

  get urlConfigured(): boolean {
    return Boolean(this.url);
  }

  /** Stores (or with null removes) a user's key. */
  setKey(userId: string, apiKey: string | null): void {
    this.users.update(userId, { immichKeyEnc: apiKey ? this.box.encrypt(apiKey) : null });
    this.clients.delete(userId);
  }

  /** Client for the user's own key; null when no (usable) key is stored. */
  tryClient(userId: string | null | undefined): ImmichClient | null {
    if (!userId || !this.url) return null;
    const enc = this.users.findById(userId)?.immichKeyEnc;
    if (!enc) return null;
    const cached = this.clients.get(userId);
    if (cached?.enc === enc) return cached.client;
    const key = this.box.decrypt(enc);
    if (!key) return null;
    const client = new ImmichClient(this.url, key);
    this.clients.set(userId, { enc, client });
    return client;
  }

  /** Like tryClient, but with a clear error for the user's own actions (photo picker). */
  client(userId: string): ImmichClient {
    if (!this.url) {
      throw new HttpError(
        503,
        'IMMICH_NOT_CONFIGURED',
        'Immich is niet ingesteld. Vul immich_url in bij de add-on configuratie.',
      );
    }
    const client = this.tryClient(userId);
    if (!client) {
      throw new HttpError(
        400,
        'IMMICH_NO_KEY',
        'Je hebt nog geen Immich API-sleutel. Stel die in bij Profiel.',
      );
    }
    return client;
  }
}
