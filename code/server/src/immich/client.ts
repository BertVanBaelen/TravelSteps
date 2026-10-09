import type { ImmichAlbum, ImmichAsset, ImmichAssetPage, MediaSize } from '@travelsteps/shared';
import { HttpError, notFound } from '../errors.js';

const TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 60_000;

/** Subset of the Immich asset response we use. */
interface RawAsset {
  id: string;
  type?: string;
  originalFileName?: string;
  fileCreatedAt?: string;
  localDateTime?: string;
  exifInfo?: {
    dateTimeOriginal?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    city?: string | null;
    country?: string | null;
    exifImageWidth?: number | null;
    exifImageHeight?: number | null;
  } | null;
}

interface RawAlbum {
  id: string;
  albumName: string;
  assetCount?: number;
  albumThumbnailAssetId?: string | null;
  assets?: RawAsset[];
}

interface SearchResponse {
  assets: { items: RawAsset[]; nextPage: string | number | null };
}

export function toAsset(a: RawAsset): ImmichAsset {
  const exif = a.exifInfo ?? {};
  const place = [exif.city, exif.country].filter(Boolean).join(', ');
  return {
    id: a.id,
    takenAt: exif.dateTimeOriginal ?? a.localDateTime ?? a.fileCreatedAt ?? null,
    fileName: a.originalFileName ?? null,
    width: exif.exifImageWidth ?? null,
    height: exif.exifImageHeight ?? null,
    lat: exif.latitude ?? null,
    lng: exif.longitude ?? null,
    place: place || null,
  };
}

const notConfigured = () =>
  new HttpError(
    503,
    'IMMICH_NOT_CONFIGURED',
    'Immich is niet ingesteld. Vul immich_url in bij de add-on configuratie en stel je API-sleutel in bij Profiel.',
  );

/** Thin client for the Immich REST API (server-side only; the API key never reaches the browser). */
export class ImmichClient {
  private readonly baseUrl: string | null;

  constructor(
    url: string | undefined,
    private readonly apiKey: string | undefined,
  ) {
    this.baseUrl = url ? url.replace(/\/+$/, '') : null;
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private async request(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {},
  ): Promise<Response> {
    if (!this.baseUrl || !this.apiKey) throw notConfigured();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(502, 'IMMICH_UNREACHABLE', 'Immich is niet bereikbaar.');
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel();
      throw new HttpError(
        502,
        'IMMICH_AUTH',
        'Immich weigert de API-sleutel. Controleer de sleutel en de rechten.',
      );
    }
    if (res.status === 404 || res.status === 400) {
      await res.body?.cancel();
      throw notFound('Foto');
    }
    if (!res.ok && res.status !== 304) {
      await res.body?.cancel();
      throw new HttpError(502, 'IMMICH_ERROR', `Immich gaf een fout (${res.status}).`);
    }
    return res;
  }

  private async json<T>(path: string, init?: Parameters<ImmichClient['request']>[1]): Promise<T> {
    const res = await this.request(path, init);
    return (await res.json()) as T;
  }

  async version(): Promise<string> {
    const about = await this.json<{ version?: string }>('/server/about');
    return about.version ?? 'onbekend';
  }

  async timeline(page: number, size: number): Promise<ImmichAssetPage> {
    const data = await this.json<SearchResponse>('/search/metadata', {
      method: 'POST',
      body: { page, size, type: 'IMAGE', order: 'desc', withExif: true },
    });
    return this.toPage(data);
  }

  async search(query: string, page: number, size: number): Promise<ImmichAssetPage> {
    const data = await this.json<SearchResponse>('/search/smart', {
      method: 'POST',
      body: { query, page, size, type: 'IMAGE', withExif: true },
    });
    return this.toPage(data);
  }

  private toPage(data: SearchResponse): ImmichAssetPage {
    const next = data.assets?.nextPage;
    return {
      items: (data.assets?.items ?? []).filter((a) => !a.type || a.type === 'IMAGE').map(toAsset),
      nextPage: next === null || next === undefined ? null : Number(next),
    };
  }

  async albums(): Promise<ImmichAlbum[]> {
    const albums = await this.json<RawAlbum[]>('/albums');
    return albums
      .map((a) => ({
        id: a.id,
        name: a.albumName,
        assetCount: a.assetCount ?? 0,
        thumbnailAssetId: a.albumThumbnailAssetId ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }

  async albumAssets(albumId: string, page: number, size: number): Promise<ImmichAssetPage> {
    const album = await this.json<RawAlbum>(`/albums/${encodeURIComponent(albumId)}`);
    const images = (album.assets ?? [])
      .filter((a) => !a.type || a.type === 'IMAGE')
      .map(toAsset)
      .sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
    const start = (page - 1) * size;
    return {
      items: images.slice(start, start + size),
      nextPage: start + size < images.length ? page + 1 : null,
    };
  }

  async asset(id: string): Promise<ImmichAsset> {
    return toAsset(await this.json<RawAsset>(`/assets/${encodeURIComponent(id)}`));
  }

  /** Streams an image; conditional request headers are passed through. */
  async media(id: string, size: MediaSize, headers: Record<string, string>): Promise<Response> {
    const path =
      size === 'original'
        ? `/assets/${encodeURIComponent(id)}/original`
        : `/assets/${encodeURIComponent(id)}/thumbnail?size=${size}`;
    return this.request(path, {
      headers: { accept: 'image/*', ...headers },
      timeoutMs: MEDIA_TIMEOUT_MS,
    });
  }
}
