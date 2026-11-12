import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { httpError } from '../http/error.js';
import { sniffFile } from './sniff.js';

const run = (file: string, args: string[], timeout: number) => new Promise<{ stdout: string }>((resolve, reject) => {
  execFile(file, args, { timeout, maxBuffer: 1_048_576 }, (error, stdout) => {
    if (error) reject(error);
    else resolve({ stdout: String(stdout) });
  });
});

let ffmpegReady: boolean | undefined;

export const hasFfmpeg = async (): Promise<boolean> => {
  if (ffmpegReady !== undefined) return ffmpegReady;
  try {
    await run('ffmpeg', ['-version'], 5_000);
    ffmpegReady = true;
  } catch {
    ffmpegReady = false;
  }
  return ffmpegReady;
};

const probeChannels = async (filePath: string): Promise<number | null> => {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=channels',
      '-of', 'csv=p=0',
      filePath,
    ], 30_000);
    const channels = Number(stdout.trim());
    return Number.isInteger(channels) && channels > 0 ? channels : null;
  } catch {
    return null;
  }
};

export const transcodeToMp3 = async (filePath: string): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'auralithic-'));
  const output = path.join(directory, `${randomUUID()}.mp3`);
  const channels = await probeChannels(filePath);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', filePath,
    '-vn',
    '-codec:a', 'libmp3lame',
    '-b:a', '192k',
    '-ar', '44100',
  ];
  if (channels === null || channels > 2) args.push('-ac', '2');
  args.push(output);
  try {
    await run('ffmpeg', args, 120_000);
    const info = await stat(output);
    const sniffed = await sniffFile(output);
    if (info.size === 0 || sniffed?.contentType !== 'audio/mpeg') {
      throw httpError(400, 'Could not transcode audio');
    }
    return output;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error;
    console.error(error instanceof Error ? error.message : 'ffmpeg failed');
    throw httpError(400, 'Could not transcode audio');
  }
};

export const removeTranscode = async (filePath: string) => {
  await rm(path.dirname(filePath), { recursive: true, force: true });
};
