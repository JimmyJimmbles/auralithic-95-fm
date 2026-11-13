import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rotationOf, stationLabel } from '../data/catalog.ts';
import { artistSlugFromHost, collectiveOrigin } from '../lib/site.ts';
import { readStationSession } from '../lib/storage.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';
import { useFullscreen } from '../hooks/useFullscreen.ts';
import { useRoute } from '../hooks/useRoute.ts';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { ArtistView } from './ArtistView.tsx';
import { ArtistsView } from './ArtistsView.tsx';
import { Artwork } from './Artwork.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { Notice } from './Notice.tsx';
import { ProgramWindow } from './ProgramWindow.tsx';
import { StationView } from './StationView.tsx';
import { Taskbar } from './Taskbar.tsx';

type WindowMode = 'open' | 'minimized' | 'closed';

const crtCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

const focusMain = () => {
  window.setTimeout(() => document.getElementById('main')?.focus({ preventScroll: true }), 0);
};

export const Desktop = ({ notice, notify }: { notice: string | null; notify: (message: string) => void }) => {
  const catalog = useCatalog();
  const route = useRoute();
  const playback = usePlayback();
  const fullscreen = useFullscreen(notify);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const crtIndex = useRef(0);
  const { follow, toggle } = playback;
  const toggleRef = useRef(toggle);
  const notifyRef = useRef(notify);
  const exitFallbackRef = useRef(fullscreen.exitFallback);
  useLayoutEffect(() => {
    toggleRef.current = toggle;
    notifyRef.current = notify;
    exitFallbackRef.current = fullscreen.exitFallback;
  });

  const [windowMode, setWindowMode] = useState<WindowMode>('open');
  const [startOpen, setStartOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

  const routeKey = route.view === 'artist' ? route.slug : route.view;
  const radioArtist = route.view === 'radio' || route.view === 'artist' ? catalog.artists[route.slug] : undefined;
  const windowTitle = route.view === 'station'
    ? 'Auralithic 95 FM · Radio'
    : route.view === 'radio'
      ? `${radioArtist?.name ?? 'Artist'} · Radio`
      : route.view === 'artists'
        ? 'Catalog · Auralithic 95 FM'
        : `${radioArtist?.name ?? 'Artist'} · Catalog`;
  const status = playback.current
    ? `${playback.playing ? 'Playing' : 'Ready'} · ${stationLabel(playback.stationId, catalog.artists)}`
    : 'Station standby';
  const catalogCount = `${rotationOf(catalog, playback.stationId).length} tracks · radio`;
  const fullscreenLabel = fullscreen.expanded ? 'Exit full screen' : 'Enter full screen';

  const held = useRef(false);

  useEffect(() => {
    if (!catalog.ready) return;
    if (route.view === 'station') {
      follow('station');
      return;
    }
    if (route.view === 'radio') {
      follow(route.slug);
      return;
    }
    if (held.current) return;
    held.current = true;
    const saved = readStationSession();
    if (!saved) return;
    if (saved.scope !== 'station' && !catalog.artists[saved.scope]) return;
    follow(saved.scope);
  }, [catalog.ready, catalog.artists, route, follow]);

  useEffect(() => {
    document.body.classList.add('radio-app');
    document.body.classList.toggle('station-page', route.view === 'station' || route.view === 'radio');
    document.body.classList.toggle('is-playing', playback.playing);
    document.body.classList.toggle('is-immersive', fullscreen.expanded);
    document.title = radioArtist && route.view === 'radio'
      ? `${radioArtist.name} Radio | Auralithic 95 FM`
      : radioArtist
        ? `${radioArtist.name} Catalog | Auralithic 95 FM`
        : 'Auralithic 95 FM';
  }, [route.view, playback.playing, fullscreen.expanded, radioArtist]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  useEffect(() => {
    if (startOpen) document.querySelector<HTMLAnchorElement>('#start-menu a')?.focus();
  }, [startOpen]);

  useEffect(() => {
    if (!trayOpen) return;
    document.querySelector<HTMLInputElement>('#tray-volume input')?.focus({ preventScroll: true });
  }, [trayOpen]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('#start-menu, #start-button')) setStartOpen(false);
      if (!target.closest('#tray-volume-panel, #tray-volume-button')) setTrayOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]'));
      if (event.key === 'Escape' && document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && trayOpen) {
        setTrayOpen(false);
        document.getElementById('tray-volume-button')?.focus();
        return;
      }
      if (event.key === 'Escape' && fullscreen.fallback) {
        exitFallbackRef.current();
        return;
      }
      if (event.key === 'Escape' && startOpen) {
        setStartOpen(false);
        document.getElementById('start-button')?.focus();
        return;
      }
      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        crtIndex.current = key === crtCode[crtIndex.current] ? crtIndex.current + 1 : Number(key === crtCode[0]);
        if (crtIndex.current === crtCode.length) {
          crtIndex.current = 0;
          notifyRef.current(document.body.classList.toggle('crt') ? 'CRT mode enabled' : 'CRT mode disabled');
        }
      }
      if (windowMode !== 'open' || event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (target instanceof Element && target.closest('button, a, input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      toggleRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen.fallback, startOpen, trayOpen, windowMode]);

  const openProgram = () => {
    setWindowMode('open');
    setStartOpen(false);
    focusMain();
  };

  const openHelp = () => dialogRef.current?.showModal();

  const minimize = () => {
    setWindowMode('minimized');
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.task-button')?.focus(), 0);
  };

  const closeWindow = () => {
    playback.pause();
    setWindowMode('closed');
    window.setTimeout(() => document.querySelector<HTMLAnchorElement>('.desktop-icons a')?.focus(), 0);
  };

  const toggleTask = () => {
    if (windowMode === 'open') {
      setWindowMode('minimized');
      return;
    }
    setWindowMode('open');
    focusMain();
  };

  const toggleFullscreen = () => {
    setStartOpen(false);
    void fullscreen.toggle();
  };

  return (
    <>
      <div className="atmosphere" aria-hidden="true">
        {playback.current ? <Artwork art={playback.current.art} alt="" fadeMs={1450} /> : null}
      </div>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="desktop">
        <nav className="desktop-icons" aria-label="Desktop shortcuts">
          <a href={artistSlugFromHost() ? `${collectiveOrigin()}/` : '/'} onClick={openProgram}>
            <img src="/icons/radio.svg" width={34} height={34} alt="" />
            <span>Auralithic 95 FM</span>
          </a>
          {artistSlugFromHost() ? (
            <a href="/catalog" onClick={openProgram}>
              <img src="/icons/folder.svg" width={34} height={34} alt="" />
              <span>Catalog</span>
            </a>
          ) : null}
          <a href={artistSlugFromHost() ? `${collectiveOrigin()}/artists` : '/artists'} onClick={openProgram}>
            <img src="/icons/folder.svg" width={34} height={34} alt="" />
            <span>Artists</span>
          </a>
        </nav>
        <ProgramWindow
          hidden={windowMode !== 'open'}
          title={windowTitle}
          route={route}
          status={status}
          catalogCount={catalogCount}
          expanded={fullscreen.expanded}
          fullscreenLabel={fullscreenLabel}
          onHelp={openHelp}
          onMinimize={minimize}
          onClose={closeWindow}
          onFullscreen={toggleFullscreen}
        >
          {route.view === 'station' ? <StationView /> : null}
          {route.view === 'radio' ? (
            <StationView
              stationName={radioArtist?.name ?? 'Artist'}
              channel={radioArtist?.id ?? '00'}
              signalCaption="ARTIST RADIO"
              connectingDetail={`Tuning ${radioArtist?.name ?? 'this station'}.`}
            />
          ) : null}
          {route.view === 'artists' ? <ArtistsView /> : null}
          {route.view === 'artist' ? <ArtistView key={route.slug} slug={route.slug} /> : null}
        </ProgramWindow>
      </div>
      <Taskbar
        windowMode={windowMode}
        startOpen={startOpen}
        trayOpen={trayOpen}
        fullscreenLabel={fullscreenLabel}
        taskLabel={windowTitle}
        onToggleStart={() => setStartOpen((open) => !open)}
        onOpenProgram={openProgram}
        onToggleTask={toggleTask}
        onFullscreen={toggleFullscreen}
        onToggleTray={() => setTrayOpen((open) => !open)}
      />
      <Notice message={notice} />
      <HelpDialog dialogRef={dialogRef} />
    </>
  );
};
