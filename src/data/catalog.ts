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
  art: string;
  type: 'Single' | 'Album';
  year: number;
};

export type Track = {
  id: string;
  name: string;
  release: string;
  length: number;
  artist: string;
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
    title: string;
    type: 'single' | 'album';
    releaseDate: string;
    coverUrl: string | null;
  }[];
  tracks: {
    id: string;
    releaseSlug: string;
    artistSlug: string;
    title: string;
    durationSeconds: number;
    audioUrl: string | null;
    coverUrl: string | null;
  }[];
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
    releases[release.slug] = {
      name: release.title,
      artist: release.artistSlug,
      art: release.coverUrl ?? '',
      type: release.type === 'album' ? 'Album' : 'Single',
      year: Number(release.releaseDate.slice(0, 4)) || new Date().getFullYear(),
    };
  }
  const tracks: Track[] = payload.tracks.flatMap((track) => {
    if (!track.audioUrl) return [];
    return [{
      id: track.id,
      name: track.title,
      release: track.releaseSlug,
      length: track.durationSeconds,
      artist: track.artistSlug,
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
  scope === 'station' ? [...catalog.tracks] : catalog.tracks.filter((track) => track.artist === scope);

export const stationLabel = (scope: string, artists: CatalogData['artists']): string => {
  if (scope === 'station') return 'Collective Radio';
  return `${artists[scope]?.name ?? 'Artist'} Radio`;
};
