import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artists, releaseArtists, releases, tracks } from '../db/schema.js';
import { httpError } from '../http/error.js';
import { hasFfmpeg, removeTranscode, transcodeToMp3 } from './transcode.js';
import { declaredTypeOk, sniffFile } from './sniff.js';
import { media } from './store.js';
import type { Sniffed } from './sniff.js';

const hashFile = (filePath: string) => new Promise<string>((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => {
    hash.update(chunk);
  });
  stream.on('end', () => {
    resolve(hash.digest('hex'));
  });
});

const accepted = async (filePath: string, declaredType: string, kind: Sniffed['kind'], rejectMessage: string) => {
  const sniffed = await sniffFile(filePath);
  if (!sniffed || sniffed.kind !== kind) throw httpError(400, rejectMessage);
  if (!declaredTypeOk(declaredType, sniffed.contentType)) {
    throw httpError(400, 'File contents do not match the declared type');
  }
  return sniffed;
};

export const saveImage = async (filePath: string, declaredType: string): Promise<string> => {
  const sniffed = await accepted(filePath, declaredType, 'image', 'Image must be JPEG, PNG, or WebP');
  return storeImage(filePath, sniffed);
};

export const saveAudio = async (filePath: string, declaredType: string) => {
  const sniffed = await accepted(filePath, declaredType, 'audio', 'Audio must be MP3, WAV, FLAC, or M4A');
  return storeAudio(filePath, sniffed);
};

export const storeImage = async (filePath: string, sniffed: Sniffed): Promise<string> => {
  if (sniffed.kind !== 'image') throw httpError(400, 'Image must be JPEG, PNG, or WebP');
  const key = `uploads/${await hashFile(filePath)}.${sniffed.extension}`;
  await media().put(key, filePath, sniffed.contentType);
  return key;
};

export const storeAudio = async (
  filePath: string,
  sniffed: Sniffed,
): Promise<{ key: string; masterKey: string | null }> => {
  if (sniffed.kind !== 'audio') throw httpError(400, 'Audio must be MP3, WAV, FLAC, or M4A');
  if (sniffed.contentType === 'audio/mpeg') {
    const key = `uploads/${await hashFile(filePath)}.mp3`;
    await media().put(key, filePath, 'audio/mpeg');
    return { key, masterKey: null };
  }
  if (await hasFfmpeg()) {
    const masterKey = `${await hashFile(filePath)}.${sniffed.extension}`;
    await media().putMaster(masterKey, filePath, sniffed.contentType);
    let mp3: string | undefined;
    try {
      mp3 = await transcodeToMp3(filePath);
      const key = `uploads/${await hashFile(mp3)}.mp3`;
      await media().put(key, mp3, 'audio/mpeg');
      return { key, masterKey };
    } catch (error) {
      await media().removeMaster(masterKey);
      throw error;
    } finally {
      if (mp3) await removeTranscode(mp3);
    }
  }
  throw httpError(400, 'Install ffmpeg to upload this audio format. Without ffmpeg only MP3 is accepted.');
};

export const publicKeyInUse = async (key: string): Promise<boolean> => {
  const [portrait] = await db.select({ slug: artists.slug }).from(artists).where(eq(artists.portraitKey, key)).limit(1);
  if (portrait) return true;
  const [cover] = await db.select({ slug: releases.slug }).from(releases).where(eq(releases.coverKey, key)).limit(1);
  if (cover) return true;
  const [audio] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.audioKey, key)).limit(1);
  return Boolean(audio);
};

export const masterKeyInUse = async (key: string): Promise<boolean> => {
  const [row] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.masterKey, key)).limit(1);
  return Boolean(row);
};

export const dropUnusedPublicKey = async (key: string | null) => {
  if (!key || await publicKeyInUse(key)) return;
  await media().remove(key);
};

export const dropUnusedMaster = async (key: string | null) => {
  if (!key || await masterKeyInUse(key)) return;
  await media().removeMaster(key);
};

export const isPublishedKey = async (key: string): Promise<boolean> => {
  const [audio] = await db.select({ id: tracks.id }).from(tracks).where(and(
    eq(tracks.audioKey, key),
    eq(tracks.status, 'published'),
  )).limit(1);
  if (audio) return true;
  const [cover] = await db.select({ slug: releases.slug }).from(releases).where(and(
    eq(releases.coverKey, key),
    eq(releases.status, 'published'),
  )).limit(1);
  if (cover) return true;
  const [portrait] = await db.select({ slug: artists.slug }).from(artists).where(eq(artists.portraitKey, key)).limit(1);
  if (!portrait) return false;
  const [release] = await db.select({ slug: releases.slug }).from(releases)
    .innerJoin(releaseArtists, eq(releaseArtists.releaseSlug, releases.slug))
    .where(and(
      eq(releaseArtists.artistSlug, portrait.slug),
      eq(releases.status, 'published'),
    )).limit(1);
  return Boolean(release);
};
