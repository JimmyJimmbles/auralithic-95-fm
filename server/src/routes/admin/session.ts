import '@fastify/cookie';
import '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, CODE_TTL_MS } from '../../constants.js';
import { config } from '../../config.js';
import { adminCookie, clearAdmin, requireAdmin, requireAdminOrigin } from '../../auth/admin.js';
import { verifyPassword } from '../../auth/password.js';
import { codesMatch, generateCode, hashCode } from '../../auth/otp.js';
import { db } from '../../db/client.js';
import { adminCredentials, adminSessions, loginCodes } from '../../db/schema.js';
import { httpError } from '../../http/error.js';
import { emptyBody, loginBody, passwordBody, read, strictEmpty, verifyBody } from '../../http/validate.js';
import { createMailer } from '../../mail/mailer.js';

const mailer = createMailer();

const startAdminSession = async (reply: FastifyReply) => {
  const sessionId = await db.transaction(async (tx) => {
    await tx.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));
    const [session] = await tx.insert(adminSessions).values({
      expiresAt: new Date(Date.now() + ADMIN_MAX_AGE * 1000),
    }).returning({ id: adminSessions.id });
    if (!session) throw httpError(500, 'Could not start a session');
    return session.id;
  });
  reply.setCookie(ADMIN_COOKIE, sessionId, adminCookie);
};

export const sessionRoutes = async (app: FastifyInstance) => {
  app.post('/api/admin/unlock', {
    preHandler: requireAdminOrigin,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, passwordBody);
    const [row] = await db.select().from(adminCredentials).where(eq(adminCredentials.id, 'owner')).limit(1);
    const matches = row ? await verifyPassword(body.password, row.passwordHash) : await verifyPassword(body.password, 'scrypt$00$00');
    if (!row || !matches) throw httpError(401, 'Unauthorized');
    await startAdminSession(reply);
    return { ok: true };
  });

  app.post('/api/admin/login', {
    preHandler: requireAdminOrigin,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, loginBody);
    const email = body.email.toLowerCase();
    // Same response for every address so this route is not an email oracle.
    if (email === config.adminEmail) {
      const code = generateCode();
      try {
        await mailer.sendLoginCode(email, code);
        await db.transaction(async (tx) => {
          await tx.delete(loginCodes).where(or(lte(loginCodes.expiresAt, new Date()), eq(loginCodes.email, email)));
          await tx.insert(loginCodes).values({
            email,
            codeHash: hashCode(code),
            expiresAt: new Date(Date.now() + CODE_TTL_MS),
          });
        });
      } catch (error) {
        request.log.error({ name: error instanceof Error ? error.name : 'Error' }, 'login code was not issued');
      }
    } else {
      hashCode('000000');
    }
    return reply.code(202).send({ ok: true });
  });

  app.post('/api/admin/verify', {
    preHandler: requireAdminOrigin,
    config: { rateLimit: { max: 8, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { body } = read(request, strictEmpty, strictEmpty, verifyBody);
    const email = body.email.toLowerCase();
    const [row] = await db.select().from(loginCodes)
      .where(eq(loginCodes.email, email))
      .orderBy(desc(loginCodes.expiresAt))
      .limit(1);
    const matches = codesMatch(body.code, row?.codeHash ?? hashCode('000000'));
    if (!row || !matches || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw httpError(401, 'Invalid code');
    }
    const sessionId = await db.transaction(async (tx) => {
      const [burned] = await tx.update(loginCodes).set({ usedAt: new Date() }).where(and(
        eq(loginCodes.id, row.id),
        isNull(loginCodes.usedAt),
        gt(loginCodes.expiresAt, new Date()),
      )).returning({ id: loginCodes.id });
      if (!burned) throw httpError(401, 'Invalid code');
      await tx.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));
      const [session] = await tx.insert(adminSessions).values({
        expiresAt: new Date(Date.now() + ADMIN_MAX_AGE * 1000),
      }).returning({ id: adminSessions.id });
      if (!session) throw httpError(500, 'Could not start a session');
      return session.id;
    });
    reply.setCookie(ADMIN_COOKIE, sessionId, adminCookie);
    return { ok: true };
  });

  if (!config.isProduction) {
    app.post('/api/admin/dev-session', { preHandler: requireAdminOrigin }, async (request, reply) => {
      read(request, strictEmpty, strictEmpty, emptyBody);
      const sessionId = await db.transaction(async (tx) => {
        await tx.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));
        const [session] = await tx.insert(adminSessions).values({
          expiresAt: new Date(Date.now() + ADMIN_MAX_AGE * 1000),
        }).returning({ id: adminSessions.id });
        if (!session) throw httpError(500, 'Could not start a session');
        return session.id;
      });
      reply.setCookie(ADMIN_COOKIE, sessionId, adminCookie);
      return { ok: true };
    });
  }

  app.post('/api/admin/logout', { preHandler: requireAdminOrigin }, async (request, reply) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    const parsed = z.string().uuid().safeParse(request.cookies[ADMIN_COOKIE]);
    clearAdmin(reply);
    if (parsed.success) await db.delete(adminSessions).where(eq(adminSessions.id, parsed.data));
    return reply.code(204).send();
  });

  app.get('/api/admin/me', { preHandler: requireAdmin }, async (request) => {
    read(request, strictEmpty, strictEmpty, emptyBody);
    return { email: config.adminEmail };
  });
};
