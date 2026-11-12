import { useRef, type ReactNode } from 'react';
import type { Route } from '../hooks/useRoute.ts';
import { collectiveOrigin } from '../lib/site.ts';
import { useWindowDrag } from '../hooks/useWindowDrag.ts';
import { MiniPlayer } from './MiniPlayer.tsx';

type ProgramWindowProps = {
  hidden: boolean;
  title: string;
  route: Route;
  status: string;
  catalogCount: string;
  expanded: boolean;
  fullscreenLabel: string;
  onHelp: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  children: ReactNode;
};

export const ProgramWindow = ({
  hidden,
  title,
  route,
  status,
  catalogCount,
  expanded,
  fullscreenLabel,
  onHelp,
  onMinimize,
  onClose,
  onFullscreen,
  children,
}: ProgramWindowProps) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useWindowDrag(windowRef);
  const onArtistRadio = route.view === 'radio' || route.view === 'artist';

  return (
    <div
      ref={windowRef}
      className="program-window"
      id="program-window"
      role="region"
      aria-label="Auralithic 95 FM window"
      hidden={hidden}
    >
      <header
        className="titlebar"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onLostPointerCapture={drag.onLostPointerCapture}
      >
        <span className="window-title">
          <img src="/icons/radio.svg" width={16} height={16} alt="" />
          <span id="public-window-title">{title}</span>
        </span>
        <div className="window-controls">
          <button type="button" className="window-button minimize" title="Minimize" aria-label="Minimize" onClick={onMinimize} />
          <button
            type="button"
            className="window-button maximize"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            aria-pressed={expanded}
            onClick={onFullscreen}
          />
          <button type="button" className="window-button close" title="Close" aria-label="Close" onClick={onClose} />
        </div>
      </header>
      <nav className="program-menu" aria-label="Main navigation">
        <a href={onArtistRadio ? '/' : collectiveOrigin()} aria-current={route.view === 'station' || route.view === 'radio' ? 'page' : undefined}><u>S</u>tation</a>
        {onArtistRadio ? (
          <a href="/catalog" aria-current={route.view === 'artist' ? 'page' : undefined}><u>C</u>atalog</a>
        ) : (
          <a href="/artists" aria-current={route.view === 'artists' ? 'page' : undefined}><u>A</u>rtists</a>
        )}
        {onArtistRadio ? <a href={collectiveOrigin()}>Auralithic FM</a> : null}
        <button type="button" onClick={onHelp}><u>H</u>elp</button>
      </nav>
      <main id="main" tabIndex={-1}>
        <div id="view">{children}</div>
      </main>
      <MiniPlayer hidden={route.view === 'station' || route.view === 'radio'} />
      <footer className="statusbar">
        <span id="radio-status">{status}</span>
        <span id="radio-catalog-count">{catalogCount}</span>
      </footer>
    </div>
  );
};
