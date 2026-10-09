import {
  postInputSchema,
  segmentKey,
  simplify,
  type Location,
  type Post,
  type PostInput,
  type Segment,
} from '@travelsteps/shared';
import type { ContentStore } from '../content/store.js';
import type { RoutingService } from './service.js';

type ParsedPostInput = ReturnType<typeof postInputSchema.parse>;

/** Segment with lighter geometry, for lists and maps. */
export function liteSegment(segment: Segment, tolerance: number): Segment {
  if (!segment.geometry) return segment;
  return { ...segment, geometry: simplify(segment.geometry, tolerance) };
}

export const sumSegments = (segments: Segment[]) => ({
  distanceKm: Math.round(segments.reduce((n, s) => n + (s.distanceKm ?? 0), 0) * 100) / 100,
  ascentM: Math.round(segments.reduce((n, s) => n + (s.ascentM ?? 0), 0)),
});

/** Calculates (or reuses cached) route geometry for a post and its connection to the previous one. */
export class PostRouting {
  constructor(
    private readonly content: ContentStore,
    private readonly routing: RoutingService,
  ) {}

  async arrival(
    travelId: string,
    date: string,
    id: string | undefined,
    locations: Location[],
    arrival: Segment | null,
  ): Promise<Segment | null> {
    if (!arrival || locations.length === 0) return null;
    const from = this.content.previousPost(travelId, date, id)?.locations.at(-1);
    // Without a previous point only the chosen mode is kept; it is routed once one appears.
    if (!from) return { mode: arrival.mode };
    return this.routing.segment(arrival, arrival.mode, from, locations[0]!);
  }

  /**
   * Parsed input (with `travelId` set) and routed segments; on create, empty distance/ascent
   * stats are pre-filled.
   */
  async prepare(input: PostInput, travelId: string, existing?: Post): Promise<ParsedPostInput> {
    const data = postInputSchema.parse(input);
    data.travelId = travelId;
    data.segments = await this.routing.segments(data.locations, data.segments);
    data.arrival = await this.arrival(
      travelId,
      data.date,
      existing?.id ?? data.id,
      data.locations,
      data.arrival,
    );

    if (!existing) {
      const { distanceKm, ascentM } = sumSegments(data.segments);
      if (data.stats.afstand === undefined && distanceKm > 0) data.stats.afstand = distanceKm;
      if (data.stats.hoogtemeters === undefined && ascentM > 0) data.stats.hoogtemeters = ascentM;
    }
    return data;
  }

  /**
   * Re-links the connections in the given travels after posts were added, moved or deleted.
   * Only connections whose end points changed are recalculated.
   */
  async refreshArrivals(travelIds: Iterable<string>): Promise<void> {
    for (const travelId of new Set(travelIds)) {
      for (const post of [...this.content.listPosts(travelId)]) {
        if (!post.arrival || post.locations.length === 0) continue;
        const from = this.content.previousPost(travelId, post.date, post.id)?.locations.at(-1);
        const expectedKey = from
          ? segmentKey(post.arrival.mode, from, post.locations[0]!)
          : undefined;
        if (expectedKey === post.arrival.key) continue;
        const next = await this.arrival(travelId, post.date, post.id, post.locations, post.arrival);
        this.content.setArrival(post.id, next);
      }
    }
  }
}
