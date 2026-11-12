import { httpError } from '../http/error.js';

type PgFailure = { code: string; constraint?: string };

const pgFailure = (error: unknown): PgFailure | null => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code: unknown }).code;
  if (typeof code !== 'string') return null;
  const constraint = 'constraint' in error ? (error as { constraint: unknown }).constraint : undefined;
  if (typeof constraint === 'string') return { code, constraint };
  return { code };
};

export const rethrowPg = (error: unknown): never => {
  const failure = pgFailure(error);
  if (failure?.code === '23505') {
    if (failure.constraint === 'artists_channel_unique') throw httpError(409, 'Channel already exists');
    if (failure.constraint === 'artists_pkey' || failure.constraint === 'releases_pkey') {
      throw httpError(409, 'Slug already exists');
    }
    if (failure.constraint === 'tracks_pkey') throw httpError(409, 'Track id already exists');
    if (failure.constraint === 'tracks_release_position_unique') throw httpError(409, 'Track position is already used');
    if (failure.constraint === 'artist_links_pkey') throw httpError(409, 'Link labels must be unique');
    throw httpError(409, 'Already exists');
  }
  if (failure?.code === '23503') throw httpError(400, 'Related record was not found');
  throw error;
};
