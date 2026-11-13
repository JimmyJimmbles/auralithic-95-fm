import { asc, inArray } from 'drizzle-orm';
import { db } from './client.js';
import { releaseArtists } from './schema.js';

export const creditsByRelease = async (slugs: readonly string[]): Promise<Map<string, string[]>> => {
  const map = new Map<string, string[]>();
  if (slugs.length === 0) return map;
  const rows = await db.select({
    releaseSlug: releaseArtists.releaseSlug,
    artistSlug: releaseArtists.artistSlug,
  }).from(releaseArtists)
    .where(inArray(releaseArtists.releaseSlug, [...slugs]))
    .orderBy(asc(releaseArtists.sort), asc(releaseArtists.artistSlug));
  for (const row of rows) {
    const list = map.get(row.releaseSlug) ?? [];
    list.push(row.artistSlug);
    map.set(row.releaseSlug, list);
  }
  return map;
};

export const creditsFor = (map: Map<string, string[]>, slug: string, fallback: string): string[] => {
  const list = map.get(slug);
  return list && list.length > 0 ? list : [fallback];
};
