import '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { QUALIFY_AFTER_SECONDS } from '../constants.js';
import { ensureListener } from '../auth/cookies.js';
import { db } from '../db/client.js';
import { playbacks, releases, tracks } from '../db/schema.js';
import { httpError } from '../http/error.js';
import { requireSiteOrigin } from '../http/origin.js';
import { emptyBody, playBody, playbackParams, read, strictEmpty } from '../http/validate.js';

const privateNoStore = 'private, no-store';

const publishedTrack = async (trackId: string) => {
  const [track] = await db.select({ id: tracks.id }).from(tracks)
    .innerJoin(releases, eq(releases.slug, tracks.releaseSlug))
    .where(and(eq(tracks.id, trackId), eq(tracks.status, 'published'), eq(releases.status, 'published')))
    .limit(1);
  return track ?? null;
};

const streamCount = async (trackId: string) => {
  const [row] = await db.select({ streams: count() }).from(playbacks).where(and(
    eq(playbacks.trackId, trackId),
    isNotNull(playbacks.qualifiedAt),
  ));
  return Number(row?.streams ?? 0);
};

export const playsRoutes = async (app: FastifyInstance) => {
  app.post('/api/plays', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: requireSiteOrigin,
  }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, playBody);
    reply.header('Cache-Control', privateNoStore);
    const track = await publishedTrack(body.trackId);
    if (!track) throw httpError(404, 'Not found');
    const listenerId = await ensureListener(request, reply);
    const [playback] = await db.insert(playbacks).values({ listenerId, trackId: body.trackId }).returning({ id: playbacks.id });
    if (!playback) throw httpError(500, 'Could not start playback');
    return { id: playback.id };
  });

  app.post('/api/plays/:id/qualify', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: requireSiteOrigin,
  }, async (request, reply) => {
    const { params } = read(request, playbackParams, strictEmpty, emptyBody);
    reply.header('Cache-Control', privateNoStore);
    const listenerId = await ensureListener(request, reply);
    // Lock the row so a second qualify sees the first write and does not count again.
    const playback = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(playbacks).where(eq(playbacks.id, params.id)).limit(1).for('update');
      if (!row || row.listenerId !== listenerId) throw httpError(404, 'Not found');
      const track = await publishedTrack(row.trackId);
      if (!track) throw httpError(404, 'Not found');
      if (!row.qualifiedAt) {
        const [clock] = await tx.select({
          elapsed: sql<string>`extract(epoch from (now() - ${playbacks.startedAt}))`,
        }).from(playbacks).where(eq(playbacks.id, params.id)).limit(1);
        const elapsed = Number(clock?.elapsed);
        if (!Number.isFinite(elapsed) || elapsed < QUALIFY_AFTER_SECONDS) {
          throw httpError(409, 'Listen for at least 10 seconds before a play counts');
        }
        await tx.update(playbacks).set({ qualifiedAt: new Date() }).where(and(
          eq(playbacks.id, params.id),
          isNull(playbacks.qualifiedAt),
        ));
      }
      return row;
    });
    return { streams: await streamCount(playback.trackId) };
  });
};
