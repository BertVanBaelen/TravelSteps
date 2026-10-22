import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import {
  assetIdSchema,
  locationSchema,
  segmentSchema,
  statsSchema,
  type Post,
} from '@travelsteps/shared';
import { parseFrontmatter } from './files.js';
import type { ContentStore, TravelRecord } from './store.js';

const TRAVEL_FILE = 'travel.md';
const POSTS_DIR = 'posts';

// Lenient schemas for the files of the old Markdown store (they may have been edited by hand).
const travelFileSchema = z.object({
  id: z.string().uuid(),
  name: z.coerce.string().min(1),
  startDate: z.coerce.string(),
  endDate: z.coerce.string().nullable().optional(),
  coverAssetId: assetIdSchema.nullable().optional(),
  createdAt: z.coerce.string().optional(),
  updatedAt: z.coerce.string().optional(),
});

const postFileSchema = z.object({
  id: z.string().uuid(),
  title: z.coerce.string().min(1),
  date: z.coerce
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'ongeldige datum')
    .transform((s) => new Date(s).toISOString()),
  photos: z.array(assetIdSchema).optional(),
  locations: z.array(locationSchema).optional(),
  segments: z.array(segmentSchema).optional(),
  arrival: segmentSchema.nullable().optional(),
  stats: statsSchema.optional(),
  createdAt: z.coerce.string().optional(),
  updatedAt: z.coerce.string().optional(),
});

/**
 * One-time migration of the Markdown files (`<root>/<travel>/travel.md` and `posts/*.md`) into
 * the database. All travels become owned by `ownerId`, all posts authored by them. Afterwards the
 * folder is renamed to `<root>.migrated`. Returns the number of imported travels and posts.
 */
export function importMarkdown(
  root: string,
  store: ContentStore,
  ownerId: string,
  log?: FastifyBaseLogger,
): { travels: number; posts: number } {
  const travels: TravelRecord[] = [];
  const posts: Post[] = [];
  const travelIds = new Set<string>();
  const postIds = new Set<string>();

  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dir = path.join(root, dirent.name);
    const file = path.join(dir, TRAVEL_FILE);
    if (!fs.existsSync(file)) continue;
    let travel: TravelRecord;
    try {
      const { data, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
      const t = travelFileSchema.parse(data);
      const mtime = fs.statSync(file).mtime.toISOString();
      travel = {
        id: t.id,
        slug: dirent.name,
        ownerId,
        name: t.name,
        description: body,
        startDate: t.startDate,
        endDate: t.endDate ?? null,
        coverAssetId: t.coverAssetId ?? null,
        createdAt: t.createdAt ?? mtime,
        updatedAt: t.updatedAt ?? mtime,
      };
    } catch (err) {
      log?.warn({ file, err: String(err) }, 'Ongeldig reisbestand overgeslagen');
      continue;
    }
    if (travelIds.has(travel.id)) {
      log?.warn({ dir }, 'Reis met dubbel ID overgeslagen');
      continue;
    }
    travelIds.add(travel.id);
    travels.push(travel);

    const postsDir = path.join(dir, POSTS_DIR);
    if (!fs.existsSync(postsDir)) continue;
    const slugs = new Set<string>();
    for (const name of fs.readdirSync(postsDir)) {
      if (!name.endsWith('.md')) continue;
      const postFile = path.join(postsDir, name);
      try {
        const { data, body } = parseFrontmatter(fs.readFileSync(postFile, 'utf8'));
        const p = postFileSchema.parse(data);
        const slug = path.basename(name, '.md');
        if (postIds.has(p.id) || slugs.has(slug)) {
          log?.warn({ file: postFile }, 'Post met dubbel ID overgeslagen');
          continue;
        }
        const mtime = fs.statSync(postFile).mtime.toISOString();
        postIds.add(p.id);
        slugs.add(slug);
        posts.push({
          id: p.id,
          slug,
          travelId: travel.id,
          authorId: ownerId,
          title: p.title,
          date: p.date,
          body,
          photos: p.photos ?? [],
          locations: p.locations ?? [],
          segments: p.segments ?? [],
          arrival: p.arrival ?? null,
          stats: p.stats ?? { custom: [] },
          createdAt: p.createdAt ?? mtime,
          updatedAt: p.updatedAt ?? mtime,
        });
      } catch (err) {
        log?.warn({ file: postFile, err: String(err) }, 'Ongeldig postbestand overgeslagen');
      }
    }
  }

  store.importContent(travels, posts);
  let target = `${root}.migrated`;
  if (fs.existsSync(target)) target = `${target}-${Date.now()}`;
  fs.renameSync(root, target);
  return { travels: travels.length, posts: posts.length };
}
