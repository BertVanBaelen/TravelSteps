import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export function parseFrontmatter(source: string): { data: unknown; body: string } {
  const match = FRONTMATTER.exec(source.replace(/^\uFEFF/, ''));
  if (!match) return { data: {}, body: source };
  return {
    data: YAML.parse(match[1]!) ?? {},
    body: match[2]!.replace(/^\r?\n/, '').trimEnd(),
  };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = YAML.stringify(data, { lineWidth: 0 });
  const text = body.trim();
  return `---\n${yaml}---\n${text ? `\n${text}\n` : ''}`;
}

/** Write to a temp file and rename, so a crash never leaves a half-written file. */
export function writeFileAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

export function slugify(text: string, fallback = 'item'): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || fallback;
}

/** `base`, `base-2`, `base-3`, … whichever is free. */
export function uniqueName(base: string, taken: (name: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken(candidate)) return candidate;
  }
}
