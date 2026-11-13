export const creditedSlugs = (release: { artistSlug: string; artistSlugs?: readonly string[] }): string[] =>
  release.artistSlugs && release.artistSlugs.length > 0 ? [...release.artistSlugs] : [release.artistSlug];

export const slugify = (value: string): string =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export const uniqueSlug = (base: string, taken: ReadonlySet<string>): string => {
  const root = slugify(base) || 'item';
  if (!taken.has(root)) return root;
  let index = 2;
  while (taken.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`.slice(0, 80);
};

export const nextChannel = (channels: readonly string[]): string => {
  const used = new Set(channels);
  for (let number = 1; number < 100; number += 1) {
    const channel = String(number).padStart(2, '0');
    if (!used.has(channel)) return channel;
  }
  return '99';
};

export const firstImage = (files: FileList): File | null =>
  [...files].find((file) => file.type.startsWith('image/')) ?? null;

export const audioFiles = (files: FileList): File[] =>
  [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a)$/i.test(file.name));

export const today = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const readDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
  const audio = document.createElement('audio');
  const url = URL.createObjectURL(file);
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const seconds = Math.max(1, Math.round(audio.duration));
    URL.revokeObjectURL(url);
    resolve(Number.isFinite(seconds) ? seconds : 1);
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not read that audio file'));
  };
  audio.src = url;
});
