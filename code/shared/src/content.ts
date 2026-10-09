import { z } from 'zod';

// ---------- Basics ----------

export const uuidSchema = z.string().uuid('Ongeldig ID');
export const assetIdSchema = z.string().uuid('Ongeldig foto-ID');

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet het formaat JJJJ-MM-DD hebben');

/** Any parseable date-time; normalised to a UTC ISO string. */
const isoDateTimeSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Ongeldige datum/tijd')
  .transform((s) => new Date(s).toISOString());

// ---------- Stats ----------

export const FIXED_STATS = [
  { key: 'afstand', label: 'Afstand', unit: 'km' },
  { key: 'hoogtemeters', label: 'Hoogtemeters', unit: 'm' },
  { key: 'maxHoogte', label: 'Max. hoogte', unit: 'm' },
  { key: 'temperatuur', label: 'Temperatuur', unit: '°C' },
  { key: 'duur', label: 'Duur', unit: 'u:mm' },
] as const;
export type FixedStatKey = (typeof FIXED_STATS)[number]['key'];

export const customStatSchema = z.object({
  label: z.string().trim().min(1, 'Label is verplicht').max(40),
  value: z.string().trim().min(1, 'Waarde is verplicht').max(40),
  unit: z.string().trim().max(15).optional(),
});
export type CustomStat = z.infer<typeof customStatSchema>;

const optionalNumber = (min: number, max: number) => z.number().finite().min(min).max(max).optional();

export const statsSchema = z.object({
  /** km */
  afstand: optionalNumber(0, 100_000),
  /** m */
  hoogtemeters: optionalNumber(0, 100_000),
  /** m */
  maxHoogte: optionalNumber(-500, 9_000),
  /** °C */
  temperatuur: optionalNumber(-90, 70),
  /** minutes */
  duur: z.number().int().min(0).max(100_000).optional(),
  custom: z.array(customStatSchema).max(20).default([]),
});
export type Stats = z.infer<typeof statsSchema>;

// ---------- Locations & segments (filled in Phase 5) ----------

export const TRANSPORT_MODES = ['lopen', 'fietsen', 'auto', 'trein', 'vliegtuig', 'boot'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().trim().max(120).optional(),
});
export type Location = z.infer<typeof locationSchema>;

/** Modes that follow roads/trails; the others are drawn as a straight (dashed) line. */
export const ROUTED_MODES: readonly TransportMode[] = ['lopen', 'fietsen', 'auto'];

export const segmentSchema = z.object({
  mode: z.enum(TRANSPORT_MODES),
  /** Cached route as [lat, lng] pairs. */
  geometry: z.array(z.tuple([z.number(), z.number()])).max(20_000).optional(),
  distanceKm: z.number().min(0).optional(),
  /** Elevation gain in metres (routed segments only). */
  ascentM: z.number().min(0).optional(),
  /** Mode + end points the geometry was calculated for; recalculated only when it changes. */
  key: z.string().max(200).optional(),
  /** 'route' = followed roads/trails; 'straight' = straight line (by design or as fallback). */
  source: z.enum(['route', 'straight']).optional(),
});
export type Segment = z.infer<typeof segmentSchema>;

export type LatLng = [number, number];

// ---------- Travels ----------

export const travelInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Naam is verplicht').max(100, 'Naam is te lang'),
    description: z.string().max(20_000, 'Beschrijving is te lang').default(''),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable().default(null),
    coverAssetId: assetIdSchema.nullable().default(null),
  })
  .refine((t) => !t.endDate || t.endDate >= t.startDate, {
    message: 'De einddatum ligt voor de startdatum',
    path: ['endDate'],
  });
export type TravelInput = z.input<typeof travelInputSchema>;

export type TravelRole = 'owner' | 'member' | 'invited';

export interface TravelMember extends UserRef {
  status: 'invited' | 'accepted';
}

export interface Travel {
  id: string;
  slug: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string | null;
  coverAssetId: string | null;
  owner: UserRef;
  /** Invited and accepted members (without the owner). */
  members: TravelMember[];
  /** Users allowed to see the travel; only filled for those who may manage it. */
  viewerIds: string[];
  /** The current user's relation to the travel. */
  myRole: TravelRole | null;
  /** Owner or admin: edit details, members, viewers, delete any post. */
  canManage: boolean;
  /** Owner or accepted member: may add posts. */
  canPost: boolean;
  createdAt: string;
  updatedAt: string;
}

export const travelMemberInputSchema = z.object({ userId: uuidSchema });
export const travelViewersInputSchema = z.object({
  userIds: z.array(uuidSchema).max(500).refine((a) => new Set(a).size === a.length, 'Dubbele gebruiker'),
});

/** A stat summed (or maximised) over all posts of a travel. */
export interface TravelStat {
  key: string;
  label: string;
  unit: string;
  value: number;
}

export interface TravelSummary extends Travel {
  postCount: number;
  photoCount: number;
  /** Total length of all routes (segments + connections between posts). */
  distanceKm: number;
  stats: TravelStat[];
}

// ---------- Posts ----------

export const postInputSchema = z.object({
  /** Client-chosen ID on create, so a retried offline upload never creates a duplicate. */
  id: uuidSchema.optional(),
  /** Defaults to the author's most recent ongoing travel. */
  travelId: uuidSchema.optional(),
  title: z.string().trim().min(1, 'Titel is verplicht').max(150, 'Titel is te lang'),
  date: isoDateTimeSchema,
  body: z.string().max(50_000, 'Tekst is te lang').default(''),
  photos: z
    .array(assetIdSchema)
    .max(100, "Maximaal 100 foto's per post")
    .refine((a) => new Set(a).size === a.length, 'Een foto staat er dubbel in')
    .default([]),
  locations: z.array(locationSchema).max(50).default([]),
  segments: z.array(segmentSchema).max(49).default([]),
  /** How the previous post's last location connects to this post's first location. */
  arrival: segmentSchema.nullable().default(null),
  stats: statsSchema.default({ custom: [] }),
  /** On update: the `updatedAt` the edit was based on; a newer server version gives 409. */
  baseUpdatedAt: z.string().max(40).optional(),
});
export type PostInput = z.input<typeof postInputSchema>;

export interface Post {
  id: string;
  slug: string;
  travelId: string;
  /** null when the author's account was deleted. */
  authorId: string | null;
  title: string;
  date: string;
  body: string;
  photos: string[];
  locations: Location[];
  segments: Segment[];
  arrival: Segment | null;
  stats: Stats;
  createdAt: string;
  updatedAt: string;
}

export interface SocialCounts {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

/** Permissions of the current user on a post. */
export interface PostPermissions {
  canEdit: boolean;
  canDelete: boolean;
}

export interface PostSummary extends SocialCounts, PostPermissions {
  id: string;
  travelId: string;
  travelName: string;
  /** null = deleted user ("Verwijderde gebruiker"). */
  author: UserRef | null;
  title: string;
  date: string;
  excerpt: string;
  coverAssetId: string | null;
  photoCount: number;
  /** All photos in order (first = cover). */
  photos: string[];
  stats: Stats;
  locations: Location[];
  /** Segments with simplified geometry (for the mini map). */
  segments: Segment[];
  arrival: Segment | null;
  /** First few people who liked the post. */
  likers: UserRef[];
  /** The latest comments (oldest first), at most 2. */
  latestComments: Comment[];
  updatedAt: string;
}

export interface PostDetail extends Post, SocialCounts, PostPermissions {
  travelName: string;
  author: UserRef | null;
}

// ---------- Blogs, subscriptions & notifications ----------

/** A traveller in the "whose blog" selector. */
export interface Traveller extends UserRef {
  /** The current user gets notifications about this traveller's blog. */
  subscribed: boolean;
}

export type NotificationType = 'post' | 'invite' | 'like' | 'comment';

export interface AppNotification {
  id: number;
  type: NotificationType;
  /** Who did it; null when that user was deleted. */
  actor: UserRef | null;
  travelId: string | null;
  travelName: string | null;
  postId: string | null;
  postTitle: string | null;
  /**
   * Short explanation: the comment text for 'comment', a preview of the post text for 'post'
   * and 'like', the travel description for 'invite'. Null when there is nothing to show.
   */
  excerpt: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationPage {
  items: AppNotification[];
  unread: number;
}

/**
 * Push services are public HTTPS hosts; refusing IP addresses, localhost and single-label
 * names keeps the server from posting to internal hosts on a user's behalf.
 */
function isPublicPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === 'https:' &&
    host.includes('.') &&
    !host.startsWith('[') &&
    !/^[\d.]+$/.test(host) &&
    !host.endsWith('.localhost') &&
    !host.endsWith('.local') &&
    !host.endsWith('.internal') &&
    !host.endsWith('.lan')
  );
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isPublicPushEndpoint, 'Ongeldig adres'),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Payload of a Web Push message (read by the service worker). */
export interface PushPayload {
  title: string;
  body: string;
  /** App path to open on click. */
  url: string;
  tag?: string;
}

// ---------- Map, routing & geocoding ----------

export interface MapPost {
  id: string;
  travelId: string;
  author: UserRef | null;
  title: string;
  date: string;
  coverAssetId: string | null;
  locations: Location[];
  segments: Segment[];
  arrival: Segment | null;
}

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

export const routePreviewSchema = z.object({
  travelId: uuidSchema.optional(),
  postId: uuidSchema.optional(),
  date: isoDateTimeSchema.optional(),
  locations: z.array(locationSchema).max(50),
  segments: z.array(segmentSchema).max(49).default([]),
  arrival: segmentSchema.nullable().default(null),
});
export type RoutePreviewInput = z.input<typeof routePreviewSchema>;

export interface RoutePreview {
  segments: Segment[];
  arrival: Segment | null;
  /** Sum over the post's own segments (not the arrival). */
  distanceKm: number;
  ascentM: number;
  /** True when a routed segment fell back to a straight line. */
  fallback: boolean;
}

// ---------- Library ----------

export interface LibraryPhoto {
  assetId: string;
  postId: string;
  postTitle: string;
  /** Who published the photo; only they can open the original. */
  authorId: string | null;
  date: string;
  travelId: string;
  travelName: string;
}

export interface FeedPage {
  items: PostSummary[];
  nextCursor: string | null;
}

// ---------- Likes & comments ----------

export const commentInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Reactie mag niet leeg zijn')
    .max(2000, 'Reactie mag maximaal 2000 tekens zijn'),
});
export type CommentInput = z.infer<typeof commentInputSchema>;

export interface UserRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  author: UserRef;
  text: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

// ---------- Immich ----------

export interface ImmichAsset {
  id: string;
  takenAt: string | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
  lat: number | null;
  lng: number | null;
  place: string | null;
}

export interface ImmichAssetPage {
  items: ImmichAsset[];
  nextPage: number | null;
}

export interface ImmichAlbum {
  id: string;
  name: string;
  assetCount: number;
  thumbnailAssetId: string | null;
}

export type MediaSize = 'thumbnail' | 'preview' | 'original';

// ---------- Settings ----------

export type SettingSource = 'addon' | 'env' | 'default';

export interface SettingItem {
  key: string;
  label: string;
  value: string | null;
  secret: boolean;
  source: SettingSource;
}

export interface ServiceStatus {
  configured: boolean;
  ok: boolean;
  detail: string | null;
}

export interface SettingsResponse {
  version: string;
  mode: 'addon' | 'docker';
  settings: SettingItem[];
  /** Immich status with the admin's own API key. */
  immich: ServiceStatus;
  routing: ServiceStatus;
  /** Web Push is available (VAPID keys could be created). */
  push: ServiceStatus;
  /** Nightly database backups in the data folder. */
  backup: ServiceStatus;
}
