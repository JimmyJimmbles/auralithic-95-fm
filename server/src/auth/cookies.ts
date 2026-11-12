import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, LISTENER_COOKIE, LISTENER_MAX_AGE } from '../constants.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { listeners } from '../db/schema.js';
import { httpError } from '../http/error.js';

// Host-only. Do not set Domain, or the admin cookie would be sent to every artist subdomain.
const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.isProduction,
  path: '/',
};

export const listenerCookie = { ...base, maxAge: LISTENER_MAX_AGE };
export const adminCookie = { ...base, maxAge: ADMIN_MAX_AGE };

export const ensureListener = async (request: FastifyRequest, reply: FastifyReply): Promise<string> => {
  const parsed = z.string().uuid().safeParse(request.cookies[LISTENER_COOKIE]);
  if (parsed.success) {
    const [existing] = await db.select({ id: listeners.id }).from(listeners).where(eq(listeners.id, parsed.data)).limit(1);
    if (existing) {
      reply.setCookie(LISTENER_COOKIE, existing.id, listenerCookie);
      return existing.id;
    }
  }
  const [created] = await db.insert(listeners).values({}).returning({ id: listeners.id });
  if (!created) throw httpError(500, 'Could not start a listener');
  reply.setCookie(LISTENER_COOKIE, created.id, listenerCookie);
  return created.id;
};
