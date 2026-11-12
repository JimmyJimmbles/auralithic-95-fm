import type { FastifyInstance } from 'fastify';
import { artistRoutes } from './admin/artists.js';
import { releaseRoutes } from './admin/releases.js';
import { sessionRoutes } from './admin/session.js';
import { statsRoutes } from './admin/stats.js';
import { trackRoutes } from './admin/tracks.js';

export const adminRoutes = async (app: FastifyInstance) => {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });
  await app.register(sessionRoutes);
  await app.register(artistRoutes);
  await app.register(releaseRoutes);
  await app.register(trackRoutes);
  await app.register(statsRoutes);
};
