import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ADMIN_COOKIE } from '../constants.js';
import { config } from '../config.js';
import { adminCookie } from './cookies.js';
import { db } from '../db/client.js';
import { adminSessions } from '../db/schema.js';
import { httpError } from '../http/error.js';
import { requireAdminOrigin } from '../http/origin.js';

export { requireAdminOrigin };

const clearAdminCookie = (reply: FastifyReply) => {
  reply.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  });
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = z.string().uuid().safeParse(request.cookies[ADMIN_COOKIE]);
  if (!parsed.success) throw httpError(401, 'Unauthorized');
  const [session] = await db.select().from(adminSessions).where(eq(adminSessions.id, parsed.data)).limit(1);
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    clearAdminCookie(reply);
    if (session) await db.delete(adminSessions).where(eq(adminSessions.id, session.id));
    throw httpError(401, 'Unauthorized');
  }
};

export const hasAdminSession = async (request: FastifyRequest): Promise<boolean> => {
  const parsed = z.string().uuid().safeParse(request.cookies[ADMIN_COOKIE]);
  if (!parsed.success) return false;
  const [session] = await db.select({ expiresAt: adminSessions.expiresAt })
    .from(adminSessions)
    .where(eq(adminSessions.id, parsed.data))
    .limit(1);
  return Boolean(session && session.expiresAt.getTime() > Date.now());
};

export const adminMutation = [requireAdminOrigin, requireAdmin];

export const clearAdmin = clearAdminCookie;

export { adminCookie };
