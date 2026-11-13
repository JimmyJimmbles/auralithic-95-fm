import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artists, liveSchedules, releaseArtists, releases, tracks, type LiveCut } from '../db/schema.js';
import { httpError } from '../http/error.js';
import { orderCycle } from './order.js';

const durationOf = (cuts: readonly LiveCut[]) => cuts.reduce((sum, cut) => sum + cut.durationMs, 0);

const sameSet = (left: readonly LiveCut[], right: readonly LiveCut[]) => {
  if (left.length !== right.length) return false;
  const a = [...left].sort((one, two) => one.id.localeCompare(two.id));
  const b = [...right].sort((one, two) => one.id.localeCompare(two.id));
  return a.every((cut, index) => cut.id === b[index]?.id && cut.durationMs === b[index]?.durationMs && cut.group === b[index]?.group);
};

const publishedCuts = async (scope: string): Promise<LiveCut[]> => {
  const rows = await db.select({
    id: tracks.id,
    durationSeconds: tracks.durationSeconds,
    artistSlug: releases.artistSlug,
    releaseSlug: tracks.releaseSlug,
  }).from(tracks)
    .innerJoin(releases, eq(releases.slug, tracks.releaseSlug))
    .innerJoin(releaseArtists, eq(releaseArtists.releaseSlug, releases.slug))
    .where(and(
      eq(tracks.status, 'published'),
      eq(releases.status, 'published'),
      isNotNull(tracks.audioKey),
      scope === 'station' ? eq(releaseArtists.sort, 0) : eq(releaseArtists.artistSlug, scope),
    ));
  return rows.map((row) => ({
    id: row.id,
    durationMs: Math.max(1, row.durationSeconds) * 1000,
    group: scope === 'station' ? row.artistSlug : row.releaseSlug,
  }));
};

export type LiveBroadcast = {
  serverNow: string;
  scope: string;
  offsetMs: number;
  endsAt: string;
  tracks: { id: string; durationMs: number }[];
};

export const liveBroadcast = async (scope: string): Promise<LiveBroadcast> => {
  if (scope !== 'station') {
    const [artist] = await db.select({ slug: artists.slug }).from(artists).where(eq(artists.slug, scope)).limit(1);
    if (!artist) throw httpError(404, 'Not found');
  }
  const desired = await publishedCuts(scope);
  const seed = randomBytes(16).toString('hex');
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.insert(liveSchedules).values({
      scope,
      seed,
      cycle: 0,
      epoch: now,
      tracks: desired.length > 0 ? orderCycle(desired, seed, 0) : [],
      pending: null,
    }).onConflictDoNothing();
    const [locked] = await tx.select().from(liveSchedules).where(eq(liveSchedules.scope, scope)).for('update').limit(1);
    if (!locked) throw httpError(500, 'Could not open the station');

    let stationSeed = locked.seed;
    let cycle = locked.cycle;
    let epoch = locked.epoch;
    let playlist = locked.tracks;
    let pending = locked.pending;
    const catalogChanged = !sameSet(desired, playlist) && !sameSet(desired, pending ?? []);
    if (playlist.length === 0) {
      playlist = desired.length > 0 ? orderCycle(desired, stationSeed, cycle) : [];
      pending = null;
      if (desired.length > 0) epoch = now;
    } else if (catalogChanged) {
      pending = desired;
    }

    let duration = durationOf(playlist);
    let steps = 0;
    while (duration > 0 && now.getTime() >= epoch.getTime() + duration && steps < 100000) {
      const lastId = playlist[playlist.length - 1]?.id;
      epoch = new Date(epoch.getTime() + duration);
      cycle += 1;
      const source = pending ?? playlist;
      playlist = orderCycle(source, stationSeed, cycle, lastId);
      pending = null;
      duration = durationOf(playlist);
      steps += 1;
    }

    if (
      stationSeed !== locked.seed
      || cycle !== locked.cycle
      || epoch.getTime() !== locked.epoch.getTime()
      || playlist !== locked.tracks
      || pending !== locked.pending
    ) {
      await tx.update(liveSchedules).set({
        seed: stationSeed,
        cycle,
        epoch,
        tracks: playlist,
        pending,
        updatedAt: now,
      }).where(eq(liveSchedules.scope, scope));
    }

    const offsetMs = duration > 0 ? Math.max(0, Math.min(duration - 1, now.getTime() - epoch.getTime())) : 0;
    return {
      serverNow: now.toISOString(),
      scope,
      offsetMs,
      endsAt: new Date(epoch.getTime() + duration).toISOString(),
      tracks: playlist.map((cut) => ({ id: cut.id, durationMs: cut.durationMs })),
    };
  });
};
