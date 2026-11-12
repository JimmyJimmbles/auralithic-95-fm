import type { AdminArtist, AdminRelease, AdminStats, AdminTrack, Workspace } from './types.ts';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const messageFrom = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error || body.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

export const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, { ...init, credentials: 'include', headers });
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw new ApiError(await messageFrom(response));
  if (response.status === 202) return response.json() as Promise<T>;
  return response.json() as Promise<T>;
};

export const upload = (path: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return api(path, { method: 'POST', body });
};

export const loadWorkspace = async (): Promise<Workspace> => {
  const [artists, releases, tracks, stats] = await Promise.all([
    api<AdminArtist[]>('/api/admin/artists'),
    api<AdminRelease[]>('/api/admin/releases'),
    api<AdminTrack[]>('/api/admin/tracks'),
    api<AdminStats>('/api/admin/stats'),
  ]);
  return { artists, releases, tracks, stats };
};
