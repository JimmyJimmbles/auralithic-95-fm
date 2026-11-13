import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { IMAGE_LIMIT } from '../../constants.js';
import { adminMutation, requireAdmin } from '../../auth/admin.js';
import { db } from '../../db/client.js';
import { rethrowPg } from '../../db/errors.js';
import { creditsByRelease, creditsFor } from '../../db/credits.js';
import { artists, playbacks, releaseArtists, releases, trackLikes, tracks, type ReleaseRow, type TrackRow } from '../../db/schema.js';
import { httpError } from '../../http/error.js';
import { receiveFile } from '../../http/multipart.js';
import { emptyBody, read, releaseBody, releasePatch, slugParams, strictEmpty } from '../../http/validate.js';
import { dropUnusedMaster, dropUnusedPublicKey, saveImage } from '../../media/upload.js';
import { media } from '../../media/store.js';

const shape = (release: ReleaseRow, artistSlugs: string[]) => ({
  slug: release.slug,
  artistSlug: artistSlugs[0] ?? release.artistSlug,
  artistSlugs,
  title: release.title,
  type: release.type,
  releaseDate: release.releaseDate,
  coverKey: release.coverKey,
  status: release.status,
  publishedAt: release.publishedAt?.toISOString() ?? null,
});

const present = async (release: ReleaseRow) => {
  const credits = await creditsByRelease([release.slug]);
  return shape(release, creditsFor(credits, release.slug, release.artistSlug));
};

const requireArtists = async (slugs: readonly string[]) => {
  const rows = await db.select({ slug: artists.slug }).from(artists).where(inArray(artists.slug, [...slugs]));
  if (rows.length !== slugs.length) throw httpError(400, 'Artist does not exist');
};

const leadOf = (slugs: readonly string[]) => {
  const lead = slugs[0];
  if (!lead) throw httpError(400, 'A release needs an artist');
  return lead;
};

const tracksFor = async (slug: string) => db.select().from(tracks)
  .where(eq(tracks.releaseSlug, slug))
  .orderBy(asc(tracks.position));

const assertPublishable = async (release: ReleaseRow, rows: TrackRow[]) => {
  if (!release.coverKey || !await media().exists(release.coverKey)) {
    throw httpError(400, 'A cover image is required to publish');
  }
  if (release.type === 'single' && rows.length !== 1) {
    throw httpError(400, 'A single must have exactly one track before publish');
  }
  if (release.type === 'album' && rows.length < 1) {
    throw httpError(400, 'An album must have at least one track before publish');
  }
  for (const track of rows) {
    if (!track.audioKey || !await media().exists(track.audioKey)) {
      throw httpError(400, 'Every track needs audio before publish');
    }
  }
};

export const releaseRoutes = async (app: FastifyInstance) => {
  app.get('/api/admin/releases', { preHandler: requireAdmin }, async (request) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    const rows = await db.select().from(releases).orderBy(asc(releases.releaseDate), asc(releases.slug));
    const credits = await creditsByRelease(rows.map((release) => release.slug));
    return rows.map((release) => shape(release, creditsFor(credits, release.slug, release.artistSlug)));
  });

  app.post('/api/admin/releases', { preHandler: adminMutation }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, releaseBody);
    await requireArtists(body.artistSlugs);
    const lead = leadOf(body.artistSlugs);
    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx.insert(releases).values({
          slug: body.slug,
          artistSlug: lead,
          title: body.title,
          type: body.type,
          releaseDate: body.releaseDate,
        }).returning();
        if (!row) throw httpError(500, 'Could not create release');
        await tx.insert(releaseArtists).values(body.artistSlugs.map((artistSlug, sort) => ({
          releaseSlug: row.slug,
          artistSlug,
          sort,
        })));
        return row;
      });
      return reply.code(201).send(await present(created));
    } catch (error) {
      throw rethrowPg(error);
    }
  });

  app.patch('/api/admin/releases/:slug', { preHandler: adminMutation }, async (request) => {
    const { params, body } = read(request, slugParams, strictEmpty, releasePatch);
    const [current] = await db.select().from(releases).where(eq(releases.slug, params.slug)).limit(1);
    if (!current) throw httpError(404, 'Not found');
    await requireArtists(body.artistSlugs);
    const lead = leadOf(body.artistSlugs);
    if (current.status === 'published') {
      const rows = await tracksFor(params.slug);
      if (body.type === 'single' && rows.length !== 1) {
        throw httpError(400, 'A published single must have exactly one track');
      }
      if (body.type === 'album' && rows.length < 1) {
        throw httpError(400, 'A published album must have at least one track');
      }
    }
    try {
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(releases).set({
          artistSlug: lead,
          title: body.title,
          type: body.type,
          releaseDate: body.releaseDate,
        }).where(eq(releases.slug, params.slug)).returning();
        if (!row) throw httpError(404, 'Not found');
        await tx.delete(releaseArtists).where(eq(releaseArtists.releaseSlug, params.slug));
        await tx.insert(releaseArtists).values(body.artistSlugs.map((artistSlug, sort) => ({
          releaseSlug: params.slug,
          artistSlug,
          sort,
        })));
        return row;
      });
      return await present(updated);
    } catch (error) {
      throw rethrowPg(error);
    }
  });

  app.post('/api/admin/releases/:slug/cover', {
    preHandler: adminMutation,
    bodyLimit: IMAGE_LIMIT + (64 * 1024),
  }, async (request) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const received = await receiveFile(request, IMAGE_LIMIT);
    try {
      const [current] = await db.select().from(releases).where(eq(releases.slug, params.slug)).limit(1);
      if (!current) throw httpError(404, 'Not found');
      const key = await saveImage(received.filePath, received.declaredType);
      try {
        await db.update(releases).set({ coverKey: key }).where(eq(releases.slug, params.slug));
      } catch (error) {
        await dropUnusedPublicKey(key);
        throw error;
      }
      if (current.coverKey !== key) await dropUnusedPublicKey(current.coverKey);
      return await present({ ...current, coverKey: key });
    } finally {
      await received.cleanup();
    }
  });

  app.post('/api/admin/releases/:slug/publish', { preHandler: adminMutation }, async (request) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const [release] = await db.select().from(releases).where(eq(releases.slug, params.slug)).limit(1);
    if (!release) throw httpError(404, 'Not found');
    const rows = await tracksFor(params.slug);
    await assertPublishable(release, rows);
    const publishedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.update(releases).set({ status: 'published', publishedAt }).where(eq(releases.slug, params.slug));
      await tx.update(tracks).set({ status: 'published' }).where(eq(tracks.releaseSlug, params.slug));
    });
    return await present({ ...release, status: 'published', publishedAt });
  });

  app.post('/api/admin/releases/:slug/unpublish', { preHandler: adminMutation }, async (request) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const [release] = await db.select().from(releases).where(eq(releases.slug, params.slug)).limit(1);
    if (!release) throw httpError(404, 'Not found');
    await db.transaction(async (tx) => {
      await tx.update(releases).set({ status: 'draft' }).where(and(
        eq(releases.slug, params.slug),
        eq(releases.status, 'published'),
      ));
      await tx.update(tracks).set({ status: 'draft' }).where(eq(tracks.releaseSlug, params.slug));
    });
    return await present({ ...release, status: 'draft' });
  });

  app.delete('/api/admin/releases/:slug', { preHandler: adminMutation }, async (request, reply) => {
    const { params } = read(request, slugParams, strictEmpty, emptyBody);
    const [release] = await db.select().from(releases).where(eq(releases.slug, params.slug)).limit(1);
    if (!release) throw httpError(404, 'Not found');
    const rows = await tracksFor(params.slug);
    const ids = rows.map((track) => track.id);
    await db.transaction(async (tx) => {
      if (ids.length > 0) {
        await tx.delete(trackLikes).where(inArray(trackLikes.trackId, ids));
        await tx.delete(playbacks).where(inArray(playbacks.trackId, ids));
        await tx.delete(tracks).where(eq(tracks.releaseSlug, params.slug));
      }
      await tx.delete(releases).where(eq(releases.slug, params.slug));
    });
    for (const track of rows) {
      await dropUnusedPublicKey(track.audioKey);
      await dropUnusedMaster(track.masterKey);
    }
    await dropUnusedPublicKey(release.coverKey);
    return reply.code(204).send();
  });
};
