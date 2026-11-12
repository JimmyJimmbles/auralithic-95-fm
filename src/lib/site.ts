const RESERVED = new Set(['www', 'admin', 'api', 'media']);

const hostName = (hostname: string): string => hostname.split(':')[0]?.toLowerCase() ?? '';

export const artistSlugFromHost = (hostname = window.location.hostname): string | null => {
  const host = hostName(hostname);
  const labels = host.split('.');
  const onLocal = host.endsWith('.localhost') && labels.length === 2;
  const onPublic = host.endsWith('.auralithic.fm') && labels.length === 3;
  if (!onLocal && !onPublic) return null;
  const slug = labels[0] ?? '';
  if (!slug || RESERVED.has(slug)) return null;
  return slug;
};

const origin = (hostname: string): string => {
  const { protocol, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

export const collectiveOrigin = (): string => {
  const host = hostName(window.location.hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) return origin('localhost');
  if (host === '127.0.0.1') return origin('127.0.0.1');
  return `${window.location.protocol}//auralithic.fm`;
};

export const artistOrigin = (slug: string): string => {
  const host = hostName(window.location.hostname);
  if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1') return origin(`${slug}.localhost`);
  return `${window.location.protocol}//${slug}.auralithic.fm`;
};

export const artistRadioHref = (slug: string): string => `${artistOrigin(slug)}/`;

export const artistCatalogHref = (slug: string): string => `${artistOrigin(slug)}/catalog`;
