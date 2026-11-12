import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { httpError } from './error.js';

const RESERVED = new Set(['www', 'admin', 'api', 'media']);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const appUrl = new URL(config.appOrigin);
const appHost = appUrl.hostname.toLowerCase();
const localApp = appHost === 'localhost' || appHost === '127.0.0.1';

const samePort = (url: URL) => url.port === appUrl.port;

const artistLabel = (host: string, suffix: string): string | null => {
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes('.') || !LABEL.test(slug) || RESERVED.has(slug)) return null;
  return slug;
};

export const isSiteOrigin = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value || url.protocol !== appUrl.protocol || !samePort(url)) return false;
  const host = url.hostname.toLowerCase();
  if (host === appHost) return true;
  if (!config.isProduction && localApp) {
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return artistLabel(host, '.localhost') !== null;
  }
  return artistLabel(host, `.${appHost}`) !== null;
};

export const isAdminOrigin = (value: string): boolean => {
  if (value === config.appOrigin || value === config.adminOrigin) return true;
  if (config.isProduction || !localApp) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value || url.protocol !== appUrl.protocol || !samePort(url)) return false;
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
};

export const requireSiteOrigin = async (request: FastifyRequest) => {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !isSiteOrigin(origin)) throw httpError(403, 'Forbidden');
};

export const requireAdminOrigin = async (request: FastifyRequest) => {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !isAdminOrigin(origin)) throw httpError(403, 'Forbidden');
};
