import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { asc, desc, eq } from 'drizzle-orm';
import { AUDIO_LIMIT } from '../../constants.js';
import { adminMutation, requireAdmin } from '../../auth/admin.js';
import { db } from '../../db/client.js';
import { rethrowPg } from '../../db/errors.js';
import { releases, tracks, playbacks, trackLikes, type TrackRow } from '../../db/schema.js';
import { httpError } from '../../http/error.js';
import { receiveFile } from '../../http/multipart.js';
import { emptyBody, read, reorderBody, strictEmpty, trackBody, trackIdParams, trackPatch } from '../../http/validate.js';
import { dropUnusedMaster, dropUnusedPublicKey, saveAudio } from '../../media/upload.js';

const present = (track: TrackRow) => ({
  id: track.id,
  releaseSlug: track.releaseSlug,
  title: track.title,
  position: track.position,
  durationSeconds: track.durationSeconds,
  audioKey: track.audioKey,
  masterKey: track.masterKey,
  status: track.status,
});

export const trackRoutes = async (app: FastifyInstance) => {
  app.get('/api/admin/tracks', { preHandler: requireAdmin }, async (request) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    const rows = await db.select().from(tracks).orderBy(asc(tracks.releaseSlug), asc(tracks.position));
    return rows.map(present);
  });

  app.post('/api/admin/tracks', { preHandler: adminMutation }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, trackBody);
    const [release] = await db.select().from(releases).where(eq(releases.slug, body.releaseSlug)).limit(1);
    if (!release) throw httpError(404, 'Not found');
    if (release.status === 'published') throw httpError(409, 'Unpublish the release before adding tracks');
    const [last] = await db.select({ position: tracks.position }).from(tracks)
      .where(eq(tracks.releaseSlug, body.releaseSlug))
      .orderBy(desc(tracks.position))
      .limit(1);
    try {
      const [created] = await db.insert(tracks).values({
        ...body,
        position: (last?.position ?? 0) + 1,
        status: 'draft',
      }).returning();
      if (!created) throw httpError(500, 'Could not create track');
      return reply.code(201).send(present(created));
    } catch (error) {
      throw rethrowPg(error);
    }
  });

  app.patch('/api/admin/tracks/:id', { preHandler: adminMutation }, async (request) => {
    const { params, body } = read(request, trackIdParams, strictEmpty, trackPatch);
    const [updated] = await db.update(tracks).set(body).where(eq(tracks.id, params.id)).returning();
    if (!updated) throw httpError(404, 'Not found');
    return present(updated);
  });

  app.post('/api/admin/tracks/reorder', { preHandler: adminMutation }, async (request) => {
    const { body } = read(request, strictEmpty, strictEmpty, reorderBody);
    const rows = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.releaseSlug, body.releaseSlug));
    const existing = new Set(rows.map((row) => row.id));
    const requested = new Set(body.trackIds);
    if (requested.size !== body.trackIds.length || requested.size !== existing.size || body.trackIds.some((id) => !existing.has(id))) {
      throw httpError(400, 'Reorder must include every track on the release exactly once');
    }
    await db.transaction(async (tx) => {
      for (const [index, id] of body.trackIds.entries()) {
        await tx.update(tracks).set({ position: -(index + 1) }).where(eq(tracks.id, id));
      }
      for (const [index, id] of body.trackIds.entries()) {
        await tx.update(tracks).set({ position: index + 1 }).where(eq(tracks.id, id));
      }
    });
    const ordered = await db.select().from(tracks)
      .where(eq(tracks.releaseSlug, body.releaseSlug))
      .orderBy(asc(tracks.position));
    return ordered.map(present);
  });

  app.post('/api/admin/tracks/:id/audio', {
    preHandler: adminMutation,
    bodyLimit: AUDIO_LIMIT + (64 * 1024),
  }, async (request) => {
    const { params } = read(request, trackIdParams, strictEmpty, emptyBody);
    const received = await receiveFile(request, AUDIO_LIMIT);
    try {
      const [current] = await db.select().from(tracks).where(eq(tracks.id, params.id)).limit(1);
      if (!current) throw httpError(404, 'Not found');
      const saved = await saveAudio(received.filePath, received.declaredType);
      try {
        await db.update(tracks).set({ audioKey: saved.key, masterKey: saved.masterKey }).where(eq(tracks.id, params.id));
      } catch (error) {
        await dropUnusedPublicKey(saved.key);
        await dropUnusedMaster(saved.masterKey);
        throw error;
      }
      if (current.audioKey !== saved.key) await dropUnusedPublicKey(current.audioKey);
      if (current.masterKey !== saved.masterKey) await dropUnusedMaster(current.masterKey);
      return present({ ...current, audioKey: saved.key, masterKey: saved.masterKey });
    } finally {
      await received.cleanup();
    }
  });

  app.delete('/api/admin/tracks/:id', { preHandler: adminMutation }, async (request, reply) => {
    const { params } = read(request, trackIdParams, strictEmpty, emptyBody);
    const [current] = await db.select().from(tracks).where(eq(tracks.id, params.id)).limit(1);
    if (!current) throw httpError(404, 'Not found');
    await db.transaction(async (tx) => {
      await tx.delete(trackLikes).where(eq(trackLikes.trackId, current.id));
      await tx.delete(playbacks).where(eq(playbacks.trackId, current.id));
      await tx.delete(tracks).where(eq(tracks.id, current.id));
      const [remaining] = await tx.select({ id: tracks.id }).from(tracks)
        .where(eq(tracks.releaseSlug, current.releaseSlug))
        .limit(1);
      if (!remaining) {
        await tx.update(releases).set({ status: 'draft' }).where(eq(releases.slug, current.releaseSlug));
      }
    });
    await dropUnusedPublicKey(current.audioKey);
    await dropUnusedMaster(current.masterKey);
    return reply.code(204).send();
  });
};
