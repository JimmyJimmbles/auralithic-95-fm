import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { config } from './config.js';
import { isAdminOrigin, isSiteOrigin } from './http/origin.js';
import { AUDIO_LIMIT, JSON_BODY_LIMIT } from './constants.js';
import { statusCodeOf } from './http/error.js';
import { initMedia } from './media/store.js';
import { adminRoutes } from './routes/admin.js';
import { catalogRoutes } from './routes/catalog.js';
import { healthRoutes } from './routes/health.js';
import { likesRoutes } from './routes/likes.js';
import { liveRoutes } from './routes/live.js';
import { mediaRoutes } from './routes/media.js';
import { playsRoutes } from './routes/plays.js';

const privatePath = (url: string) => {
  const path = url.split('?')[0] ?? '';
  return path.startsWith('/api/admin') || path.startsWith('/api/likes') || path.startsWith('/api/plays');
};

export const buildApp = async () => {
  const app = Fastify({
    logger: { redact: ['req.headers.cookie', 'req.headers.authorization'] },
    // One hop when enabled, so a client cannot spoof the address used for rate limits.
    trustProxy: config.trustProxy ? ((_address: string, hop: number) => hop === 0) : false,
    bodyLimit: JSON_BODY_LIMIT,
    maxParamLength: 512,
  });

  await initMedia();
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, !origin || isSiteOrigin(origin) || isAdminOrigin(origin));
    },
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { files: 1, fileSize: AUDIO_LIMIT, fields: 2, fieldSize: 1024 },
    throwFileSizeLimit: false,
  });

  await app.register(healthRoutes);
  await app.register(catalogRoutes);
  await app.register(liveRoutes);
  await app.register(likesRoutes);
  await app.register(playsRoutes);
  await app.register(adminRoutes);
  if (config.media.driver === 'disk') await app.register(mediaRoutes);

  app.setNotFoundHandler((request, reply) => {
    if (privatePath(request.url)) reply.header('Cache-Control', 'private, no-store');
    return reply.code(404).send({ error: 'Not found' });
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = statusCodeOf(error);
    if (privatePath(request.url)) reply.header('Cache-Control', 'private, no-store');
    if (statusCode >= 500) {
      request.log.error(error);
      const message = !config.isProduction && error instanceof Error && error.message
        ? error.message
        : 'Internal Server Error';
      return reply.code(statusCode).send({ error: message });
    }
    const message = error instanceof Error && error.message ? error.message : 'Request failed';
    return reply.code(statusCode).send({ error: message });
  });

  return app;
};
