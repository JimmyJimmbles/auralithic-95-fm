import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artistLinks, artists, playbacks, releases, tracks } from '../db/schema.js';
import { strictEmpty, emptyBody, read } from '../http/validate.js';
import { media } from '../media/store.js';

export const catalogRoutes = async (app: FastifyInstance) => {
  app.get('/api/catalog', async (request, reply) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    reply.header('Cache-Control', 'no-cache');
    const releaseRows = await db.select().from(releases)
      .where(eq(releases.status, 'published'))
      .orderBy(asc(releases.releaseDate), asc(releases.slug));
    if (releaseRows.length === 0) return { artists: [], releases: [], tracks: [] };

    const artistSlugs = [...new Set(releaseRows.map((release) => release.artistSlug))];
    const releaseSlugs = releaseRows.map((release) => release.slug);
    const artistRows = await db.select().from(artists)
      .where(inArray(artists.slug, artistSlugs))
      .orderBy(asc(artists.channel));
    const linkRows = await db.select().from(artistLinks)
      .where(inArray(artistLinks.artistSlug, artistSlugs))
      .orderBy(asc(artistLinks.sort));
    const trackRows = await db.select().from(tracks)
      .where(and(inArray(tracks.releaseSlug, releaseSlugs), eq(tracks.status, 'published')))
      .orderBy(asc(tracks.position));
    const streamRows = trackRows.length === 0 ? [] : await db.select({ trackId: playbacks.trackId, total: count() }).from(playbacks)
      .where(and(inArray(playbacks.trackId, trackRows.map((track) => track.id)), isNotNull(playbacks.qualifiedAt)))
      .groupBy(playbacks.trackId);
    const streamsById = new Map(streamRows.map((row) => [row.trackId, Number(row.total)]));

    const linksByArtist = new Map<string, { label: string; url: string }[]>();
    for (const link of linkRows) {
      const list = linksByArtist.get(link.artistSlug) ?? [];
      list.push({ label: link.label, url: link.url });
      linksByArtist.set(link.artistSlug, list);
    }
    const releaseBySlug = new Map(releaseRows.map((release) => [release.slug, release]));
    const urlFor = (key: string | null) => (key ? media().publicUrl(key) : null);

    return {
      artists: artistRows.map((artist) => ({
        slug: artist.slug,
        name: artist.name,
        channel: artist.channel,
        style: artist.style,
        bio: artist.bio,
        portraitUrl: urlFor(artist.portraitKey),
        links: linksByArtist.get(artist.slug) ?? [],
      })),
      releases: releaseRows.map((release) => ({
        slug: release.slug,
        artistSlug: release.artistSlug,
        title: release.title,
        type: release.type,
        releaseDate: release.releaseDate,
        coverUrl: urlFor(release.coverKey),
      })),
      tracks: trackRows.map((track) => {
        const release = releaseBySlug.get(track.releaseSlug);
        return {
          id: track.id,
          releaseSlug: track.releaseSlug,
          artistSlug: release?.artistSlug ?? '',
          title: track.title,
          position: track.position,
          durationSeconds: track.durationSeconds,
          streams: streamsById.get(track.id) ?? 0,
          audioUrl: urlFor(track.audioKey),
          coverUrl: urlFor(release?.coverKey ?? null),
        };
      }),
    };
  });
};
