import type { FastifyInstance } from 'fastify';
import '@fastify/rate-limit';
import { z } from 'zod';
import { liveBroadcast } from '../live/broadcast.js';
import { emptyBody, read, strictEmpty } from '../http/validate.js';

const scopeParams = z.object({
  scope: z.string().trim().regex(/^(station|[a-z0-9]+(?:-[a-z0-9]+)*)$/),
}).strict();

export const liveRoutes = async (app: FastifyInstance) => {
  app.get('/api/live/:scope', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { params } = read(request, scopeParams, strictEmpty, emptyBody);
    reply.header('Cache-Control', 'no-store');
    return liveBroadcast(params.scope);
  });
};
