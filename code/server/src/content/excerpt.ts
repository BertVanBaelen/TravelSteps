const EXCERPT_LENGTH = 220;

/** Shortens plain text on a word boundary, adding an ellipsis when cut. */
export function truncate(text: string, length: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= length) return clean;
  const cut = clean.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), length - 30)).trimEnd()}…`;
}

/** Plain-text preview of a Markdown body. */
export function excerpt(markdown: string, length = EXCERPT_LENGTH): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(
      /&(lt|gt|amp|quot|#39);/g,
      (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'" })[e] ?? '',
    )
    .replace(/\\([\\`*_{}[\]()#+\-.!<>|~])/g, '$1');
  return truncate(text, length);
}
