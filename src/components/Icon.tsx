import type { ReactNode } from 'react';

export type IconName = 'play' | 'pause' | 'back' | 'diagonal' | 'heart' | 'shuffle' | 'fullscreen' | 'volume' | 'mute';

const glyph = (name: IconName): ReactNode => {
  if (name === 'play') {
    return <path fill="currentColor" stroke="none" d="M8 4.6a1 1 0 0 0-1.5.9v13a1 1 0 0 0 1.5.9l11-6.5a1 1 0 0 0 0-1.8z" />;
  }
  if (name === 'pause') return <path strokeWidth={4} d="M9 5v14m6-14v14" />;
  if (name === 'back') return <path d="M20 12H4m6-6-6 6 6 6" />;
  if (name === 'diagonal') return <path d="M6 18 18 6M8 6h10v10" />;
  if (name === 'heart') return <path d="M3 5h6v3h6V5h6v3h2v6h-3v3h-3v3h-3v3h-3v-3H8v-3H5v-3H2V8h1z" />;
  if (name === 'shuffle') {
    return <path d="M3 6h3c4 0 5 12 9 12h5m-4-4 4 4-4 4M3 18h3c1.3 0 2.2-1.3 3-3m4-6c.8-1.8 1.7-3 3-3h4m-4-4 4 4-4 4" />;
  }
  if (name === 'fullscreen') return <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />;
  if (name === 'volume') {
    return (
      <>
        <path fill="currentColor" stroke="none" d="M3 9h4l6-5v16l-6-5H3z" />
        <path d="M16 8h2v8h-2m4-11h2v14h-2" />
      </>
    );
  }
  return <path d="M11 5 6 9H3v6h3l5 4zm5 5 5 5m0-5-5 5" />;
};

export const Icon = ({ name }: { name: IconName }) => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden="true"
  >
    {glyph(name)}
  </svg>
);
