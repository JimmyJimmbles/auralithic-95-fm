export type Artist = {
  name: string;
  id: string;
  style: string;
  art: string;
  bio: string;
  links: readonly (readonly [string, string])[];
};

export type Release = {
  name: string;
  artist: string;
  artists: readonly string[];
  art: string;
  type: 'Single' | 'Album';
  year: number;
};

export type Track = {
  id: string;
  name: string;
  release: string;
  length: number;
  streams: number;
  artist: string;
  artists: readonly string[];
  art: string;
  audio: string;
};

export type CatalogData = {
  artists: Record<string, Artist>;
  releases: Record<string, Release>;
  tracks: readonly Track[];
  ready: boolean;
};

export const emptyCatalog = {
  artists: {},
  releases: {},
  tracks: [],
  ready: false,
} as const satisfies CatalogData;

export type ApiCatalog = {
  artists: {
    slug: string;
    name: string;
    channel: string;
    style: string;
    bio: string;
    portraitUrl: string | null;
    links: { label: string; url: string }[];
  }[];
  releases: {
    slug: string;
    artistSlug: string;
    artistSlugs?: readonly string[];
    title: string;
    type: 'single' | 'album';
    releaseDate: string;
    coverUrl: string | null;
  }[];
  tracks: {
    id: string;
    releaseSlug: string;
    artistSlug: string;
    artistSlugs?: readonly string[];
    title: string;
    durationSeconds: number;
    streams: number;
    audioUrl: string | null;
    coverUrl: string | null;
  }[];
};

const creditsOf = (artistSlug: string, artistSlugs?: readonly string[]): string[] =>
  artistSlugs && artistSlugs.length > 0 ? [...artistSlugs] : [artistSlug];

export const creditLine = (names: readonly string[]): string => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
};

export const mapCatalog = (payload: ApiCatalog): CatalogData => {
  const artists: Record<string, Artist> = {};
  for (const artist of payload.artists) {
    artists[artist.slug] = {
      name: artist.name,
      id: artist.channel,
      style: artist.style,
      art: artist.portraitUrl ?? '',
      bio: artist.bio,
      links: artist.links.map((link) => [link.label, link.url]),
    };
  }
  const releases: Record<string, Release> = {};
  for (const release of payload.releases) {
    const credited = creditsOf(release.artistSlug, release.artistSlugs);
    releases[release.slug] = {
      name: release.title,
      artist: credited[0] ?? release.artistSlug,
      artists: credited,
      art: release.coverUrl ?? '',
      type: release.type === 'album' ? 'Album' : 'Single',
      year: Number(release.releaseDate.slice(0, 4)) || new Date().getFullYear(),
    };
  }
  const tracks: Track[] = payload.tracks.flatMap((track) => {
    if (!track.audioUrl) return [];
    const credited = creditsOf(track.artistSlug, track.artistSlugs);
    return [{
      id: track.id,
      name: track.title,
      release: track.releaseSlug,
      length: track.durationSeconds,
      streams: track.streams ?? 0,
      artist: credited[0] ?? track.artistSlug,
      artists: credited,
      art: track.coverUrl ?? '',
      audio: track.audioUrl,
    }];
  });
  return { artists, releases, tracks, ready: true };
};

export const coverUrl = (art: string): string => {
  if (!art) return '/icons/folder.svg';
  if (art.startsWith('/') || art.startsWith('blob:') || art.startsWith('http://') || art.startsWith('https://')) return art;
  return `/media/${art}.webp`;
};

export const audioUrl = (track: Track): string => track.audio || `/media/${track.id}.mp3`;

export const rotationOf = (catalog: CatalogData, scope: string): Track[] =>
  scope === 'station' ? [...catalog.tracks] : catalog.tracks.filter((track) => track.artists.includes(scope));

export const stationLabel = (scope: string, artists: CatalogData['artists']): string => {
  if (scope === 'station') return 'Collective Radio';
  return `${artists[scope]?.name ?? 'Artist'} Radio`;
};
