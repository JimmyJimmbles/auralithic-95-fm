import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { adminMutation, requireAdmin } from '../../auth/admin.js';
import { db } from '../../db/client.js';
import { rethrowPg } from '../../db/errors.js';
import { artistLinks, artists, playbacks, releaseArtists, releases, trackLikes, tracks, type ArtistRow } from '../../db/schema.js';
import { httpError } from '../../http/error.js';
import { receiveFile } from '../../http/multipart.js';
import { artistBody, artistPatch, emptyBody, read, slugParams, strictEmpty } from '../../http/validate.js';
import { IMAGE_LIMIT } from '../../constants.js';
import { dropUnusedMaster, dropUnusedPublicKey, saveImage } from '../../media/upload.js';

const present = (artist: ArtistRow, links: { label: string; url: string; sort: number }[]) => ({
  slug: artist.slug,
  name: artist.name,
  channel: artist.channel,
  style: artist.style,
  bio: artist.bio,
  portraitKey: artist.portraitKey,
  links,
});

const linksFor = async (slug: string) => db.select({
  label: artistLinks.label,
  url: artistLinks.url,
  sort: artistLinks.sort,
}).from(artistLinks).where(eq(artistLinks.artistSlug, slug)).orderBy(asc(artistLinks.sort));

const linkValues = (slug: string, links: { label: string; url: string }[]) => links.map((link, index) => ({
  artistSlug: slug,
  label: link.label,
  url: link.url,
  sort: index,
}));

export const artistRoutes = async (app: FastifyInstance) => {
  app.get('/api/admin/artists', { preHandler: requireAdmin }, async (request) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    const rows = await db.select().from(artists).orderBy(asc(artists.channel));
    const links = rows.length === 0
      ? []
      : await db.select().from(artistLinks).orderBy(asc(artistLinks.sort));
    return rows.map((artist) => present(
      artist,
      links.filter((link) => link.artistSlug === artist.slug).map((link) => ({
        label: link.label,
        url: link.url,
        sort: link.sort,
      })),
    ));
  });

  app.post('/api/admin/artists', { preHandler: adminMutation }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, artistBody);
    try {
      const artist = await db.transaction(async (tx) => {
        const [created] = await tx.insert(artists).values({
          slug: body.slug,
          name: body.name,
          channel: body.channel,
          style: body.style,
          bio: body.bio,
        }).returning();
        if (!created) throw httpError(500, 'Could not create artist');
        if (body.links.length > 0) await tx.insert(artistLinks).values(linkValues(created.slug, body.links));
        return created;
      });
      return reply.code(201).send(present(artist, body.links.map((link, sort) => ({ ...link, sort }))));
    } catch (error) {
      throw rethrowPg(error);
    }
  });

  app.patch('/api/admin/artists/:slug', { preHandler: adminMutation }, async (request) => {
    const { params, body } = read(request, slugParams, strictEmpty, artistPatch);
    try {
      const artist = await db.transaction(async (tx) => {
        const [updated] = await tx.update(artists).set({
          name: body.name,
          channel: body.channel,
          style: body.style,
          bio: body.bio,
          updatedAt: new Date(),
        }).where(eq(artists.slug, params.slug)).returning();
        if (!updated) throw httpError(404, 'Not found');
        await tx.delete(artistLinks).where(eq(artistLinks.artistSlug, params.slug));
        if (body.links.length > 0) await tx.insert(artistLinks).values(linkValues(params.slug, body.links));
        return updated;
      });
      return present(artist, body.links.map((link, sort) => ({ ...link, sort })));
    } catch (error) {
      throw rethrowPg(error);
    }
  });

  app.post('/api/admin/artists/:slug/portrait', {
    preHandler: adminMutation,
    bodyLimit: IMAGE_LIMIT + (64 * 1024),
  }, async (request) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const received = await receiveFile(request, IMAGE_LIMIT);
    try {
      const [current] = await db.select().from(artists).where(eq(artists.slug, params.slug)).limit(1);
      if (!current) throw httpError(404, 'Not found');
      const key = await saveImage(received.filePath, received.declaredType);
      try {
        await db.update(artists).set({ portraitKey: key, updatedAt: new Date() }).where(eq(artists.slug, params.slug));
      } catch (error) {
        await dropUnusedPublicKey(key);
        throw error;
      }
      if (current.portraitKey !== key) await dropUnusedPublicKey(current.portraitKey);
      const links = await linksFor(params.slug);
      return present({ ...current, portraitKey: key, updatedAt: new Date() }, links);
    } finally {
      await received.cleanup();
    }
  });

  app.delete('/api/admin/artists/:slug', { preHandler: adminMutation }, async (request, reply) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const [artist] = await db.select().from(artists).where(eq(artists.slug, params.slug)).limit(1);
    if (!artist) throw httpError(404, 'Not found');
    const credited = await db.select({ releaseSlug: releaseArtists.releaseSlug }).from(releaseArtists)
      .where(eq(releaseArtists.artistSlug, params.slug));
    const led = await db.select({ slug: releases.slug }).from(releases).where(eq(releases.artistSlug, params.slug));
    const releaseSlugs = [...new Set([...credited.map((row) => row.releaseSlug), ...led.map((row) => row.slug)])];
    const membership = releaseSlugs.length === 0 ? [] : await db.select().from(releaseArtists)
      .where(inArray(releaseArtists.releaseSlug, releaseSlugs))
      .orderBy(asc(releaseArtists.sort));
    const byRelease = new Map<string, { artistSlug: string; sort: number }[]>();
    for (const row of membership) {
      const list = byRelease.get(row.releaseSlug) ?? [];
      list.push({ artistSlug: row.artistSlug, sort: row.sort });
      byRelease.set(row.releaseSlug, list);
    }
    const exclusive: string[] = [];
    const shared: { slug: string; next: { artistSlug: string; sort: number } }[] = [];
    for (const slug of releaseSlugs) {
      const next = (byRelease.get(slug) ?? []).find((credit) => credit.artistSlug !== params.slug);
      if (next) shared.push({ slug, next });
      else exclusive.push(slug);
    }
    const releaseRows = exclusive.length === 0 ? [] : await db.select().from(releases).where(inArray(releases.slug, exclusive));
    const trackRows = exclusive.length === 0 ? [] : await db.select().from(tracks).where(inArray(tracks.releaseSlug, exclusive));
    const trackIds = trackRows.map((track) => track.id);
    await db.transaction(async (tx) => {
      if (trackIds.length > 0) {
        await tx.delete(trackLikes).where(inArray(trackLikes.trackId, trackIds));
        await tx.delete(playbacks).where(inArray(playbacks.trackId, trackIds));
        await tx.delete(tracks).where(inArray(tracks.releaseSlug, exclusive));
      }
      if (exclusive.length > 0) await tx.delete(releases).where(inArray(releases.slug, exclusive));
      for (const { slug, next } of shared) {
        await tx.delete(releaseArtists).where(and(
          eq(releaseArtists.releaseSlug, slug),
          eq(releaseArtists.artistSlug, params.slug),
        ));
        if (next.sort !== 0) {
          await tx.update(releaseArtists).set({ sort: 0 }).where(and(
            eq(releaseArtists.releaseSlug, slug),
            eq(releaseArtists.artistSlug, next.artistSlug),
          ));
        }
        await tx.update(releases).set({ artistSlug: next.artistSlug }).where(eq(releases.slug, slug));
      }
      await tx.delete(artistLinks).where(eq(artistLinks.artistSlug, params.slug));
      await tx.delete(artists).where(eq(artists.slug, params.slug));
    });
    for (const track of trackRows) {
      await dropUnusedPublicKey(track.audioKey);
      await dropUnusedMaster(track.masterKey);
    }
    for (const release of releaseRows) await dropUnusedPublicKey(release.coverKey);
    await dropUnusedPublicKey(artist.portraitKey);
    return reply.code(204).send();
  });
};
