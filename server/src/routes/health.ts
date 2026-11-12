import type { FastifyInstance } from 'fastify';
import { sql } from '../db/client.js';
import { strictEmpty, emptyBody, read } from '../http/validate.js';

export const healthRoutes = async (app: FastifyInstance) => {
  app.get('/healthz', async (request, reply) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    return reply.header('Cache-Control', 'no-store').send({ ok: true });
  });

  app.get('/readyz', async (request, reply) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    reply.header('Cache-Control', 'no-store');
    try {
      await sql`select 1`;
      return { ok: true };
    } catch (error) {
      request.log.error({ name: error instanceof Error ? error.name : 'Error' }, 'database ping failed');
      return reply.code(503).send({ ok: false });
    }
  });
};
