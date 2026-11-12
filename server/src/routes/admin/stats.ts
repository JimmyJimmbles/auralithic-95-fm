import type { FastifyInstance } from 'fastify';
import { count, isNotNull } from 'drizzle-orm';
import { requireAdmin } from '../../auth/admin.js';
import { db } from '../../db/client.js';
import { playbacks, trackLikes } from '../../db/schema.js';
import { emptyBody, read, strictEmpty } from '../../http/validate.js';

export const statsRoutes = async (app: FastifyInstance) => {
  app.get('/api/admin/stats', { preHandler: requireAdmin }, async (request) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    const likes = await db.select({
      trackId: trackLikes.trackId,
      total: count(),
    }).from(trackLikes).groupBy(trackLikes.trackId);
    const streams = await db.select({
      trackId: playbacks.trackId,
      total: count(),
    }).from(playbacks).where(isNotNull(playbacks.qualifiedAt)).groupBy(playbacks.trackId);
    return {
      likes: Object.fromEntries(likes.map((row) => [row.trackId, Number(row.total)])),
      streams: Object.fromEntries(streams.map((row) => [row.trackId, Number(row.total)])),
    };
  });
};
