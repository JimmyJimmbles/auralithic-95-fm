import '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { and, count, eq, inArray } from 'drizzle-orm';
import { ensureListener } from '../auth/cookies.js';
import { db } from '../db/client.js';
import { releases, trackLikes, tracks } from '../db/schema.js';
import { httpError } from '../http/error.js';
import { requireSiteOrigin } from '../http/origin.js';
import { emptyBody, likeBody, read, strictEmpty, trackParams } from '../http/validate.js';

const privateNoStore = 'private, no-store';

const publishedIds = async () => {
  const rows = await db.select({ id: tracks.id }).from(tracks)
    .innerJoin(releases, eq(releases.slug, tracks.releaseSlug))
    .where(and(eq(tracks.status, 'published'), eq(releases.status, 'published')));
  return rows.map((row) => row.id);
};

const likeState = async (trackId: string, listenerId: string) => {
  const [totals] = await db.select({ total: count() }).from(trackLikes).where(eq(trackLikes.trackId, trackId));
  const [mine] = await db.select({ trackId: trackLikes.trackId }).from(trackLikes).where(and(
    eq(trackLikes.listenerId, listenerId),
    eq(trackLikes.trackId, trackId),
  )).limit(1);
  return { total: Number(totals?.total ?? 0), liked: Boolean(mine) };
};

export const likesRoutes = async (app: FastifyInstance) => {
  app.get('/api/likes', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    reply.header('Cache-Control', privateNoStore);
    const listenerId = await ensureListener(request, reply);
    const ids = await publishedIds();
    const body: Record<string, { total: number; liked: boolean }> = {};
    if (ids.length === 0) return body;
    const totals = await db.select({ trackId: trackLikes.trackId, total: count() })
      .from(trackLikes)
      .where(inArray(trackLikes.trackId, ids))
      .groupBy(trackLikes.trackId);
    const mine = await db.select({ trackId: trackLikes.trackId }).from(trackLikes).where(and(
      eq(trackLikes.listenerId, listenerId),
      inArray(trackLikes.trackId, ids),
    ));
    const totalById = new Map(totals.map((row) => [row.trackId, Number(row.total)]));
    const liked = new Set(mine.map((row) => row.trackId));
    for (const id of ids) body[id] = { total: totalById.get(id) ?? 0, liked: liked.has(id) };
    return body;
  });

  app.put('/api/likes/:trackId', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preHandler: requireSiteOrigin,
  }, async (request, reply) => {
    const { params, body } = read(request, trackParams, strictEmpty, likeBody);
    reply.header('Cache-Control', privateNoStore);
    const [track] = await db.select({ id: tracks.id }).from(tracks)
      .innerJoin(releases, eq(releases.slug, tracks.releaseSlug))
      .where(and(
        eq(tracks.id, params.trackId),
        eq(tracks.status, 'published'),
        eq(releases.status, 'published'),
      ))
      .limit(1);
    if (!track) throw httpError(404, 'Not found');
    const listenerId = await ensureListener(request, reply);
    await db.transaction(async (tx) => {
      if (body.liked) {
        await tx.insert(trackLikes).values({ listenerId, trackId: params.trackId }).onConflictDoNothing();
        return;
      }
      await tx.delete(trackLikes).where(and(
        eq(trackLikes.listenerId, listenerId),
        eq(trackLikes.trackId, params.trackId),
      ));
    });
    return likeState(params.trackId, listenerId);
  });
};
