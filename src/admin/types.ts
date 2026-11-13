export type AdminArtist = {
  slug: string;
  name: string;
  channel: string;
  style: string;
  bio: string;
  portraitKey: string | null;
  links: { label: string; url: string; sort: number }[];
};

export type AdminRelease = {
  slug: string;
  artistSlug: string;
  artistSlugs: string[];
  title: string;
  type: 'single' | 'album';
  releaseDate: string;
  coverKey: string | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
};

export type AdminTrack = {
  id: string;
  releaseSlug: string;
  title: string;
  position: number;
  durationSeconds: number;
  audioKey: string | null;
  status: 'draft' | 'published';
};

export type AdminStats = {
  likes: Record<string, number>;
  streams: Record<string, number>;
};

export type Workspace = {
  artists: AdminArtist[];
  releases: AdminRelease[];
  tracks: AdminTrack[];
  stats: AdminStats;
};

export const mediaUrl = (key: string | null): string => {
  if (!key) return '';
  return `/media/${key.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
};
