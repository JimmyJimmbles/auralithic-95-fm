import { coverUrl } from '../data/catalog.ts';
import { artistRadioHref, artistSlugFromHost, collectiveOrigin } from '../lib/site.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { useClock } from '../hooks/useClock.ts';
import { Icon } from './Icon.tsx';
import { VolumeControl } from './VolumeControl.tsx';

type WindowMode = 'open' | 'minimized' | 'closed';

type TaskbarProps = {
  windowMode: WindowMode;
  startOpen: boolean;
  trayOpen: boolean;
  fullscreenLabel: string;
  taskLabel: string;
  onToggleStart: () => void;
  onOpenProgram: () => void;
  onToggleTask: () => void;
  onFullscreen: () => void;
  onToggleTray: () => void;
};

export const Taskbar = ({
  windowMode,
  startOpen,
  trayOpen,
  fullscreenLabel,
  taskLabel,
  onToggleStart,
  onOpenProgram,
  onToggleTask,
  onFullscreen,
  onToggleTray,
}: TaskbarProps) => {
  const playback = usePlayback();
  const catalog = useCatalog();
  const clock = useClock();
  const silent = playback.effectiveVolume === 0;
  const artists = Object.entries(catalog.artists).sort(([, left], [, right]) => left.name.localeCompare(right.name));

  return (
    <div className="taskbar" aria-label="Desktop taskbar">
      <button
        type="button"
        id="start-button"
        className="start-button"
        aria-expanded={startOpen}
        aria-controls="start-menu"
        onClick={onToggleStart}
      >
        <img src="/icons/start.svg" alt="" width={19} height={16} />
        <strong>Start</strong>
      </button>
      <nav className="start-menu" id="start-menu" aria-label="Start menu" hidden={!startOpen}>
        <div className="start-strip"><strong>Auralithic</strong> 95 FM</div>
        <div className="start-items">
          <a href={artistSlugFromHost() ? `${collectiveOrigin()}/` : '/'} onClick={onOpenProgram}>
            <img src="/icons/radio.svg" width={23} height={23} alt="" />
            Auralithic 95 FM
          </a>
          {artists.map(([slug, artist]) => (
            <a key={slug} href={artistRadioHref(slug)} onClick={onOpenProgram}>
              <img className="artist-portrait" src={coverUrl(artist.art)} width={23} height={23} alt="" />
              {artist.name}
            </a>
          ))}
          <button type="button" onClick={onFullscreen}>
            <Icon name="fullscreen" />
            <span>{fullscreenLabel}</span>
          </button>
        </div>
      </nav>
      <button
        type="button"
        className="task-button"
        aria-controls="program-window"
        aria-pressed={windowMode === 'open'}
        hidden={windowMode === 'closed'}
        onClick={onToggleTask}
      >
        <img src="/icons/radio.svg" width={17} height={17} alt="" />
        <span>{taskLabel}</span>
      </button>
      <div className="task-tray">
        <button
          type="button"
          id="tray-volume-button"
          className="tray-button"
          title="Open volume control"
          aria-label="Taskbar volume"
          aria-expanded={trayOpen}
          aria-controls="tray-volume-panel"
          onClick={onToggleTray}
        >
          <Icon name={silent ? 'mute' : 'volume'} />
        </button>
        <time className="tray-clock" dateTime={clock.dateTime}>{clock.label}</time>
      </div>
      <section className="tray-volume-panel" id="tray-volume-panel" aria-labelledby="tray-volume-title" hidden={!trayOpen}>
        <header className="titlebar" id="tray-volume-title">Volume Control</header>
        <div id="tray-volume">
          <VolumeControl
            label="Taskbar volume level"
            value={playback.effectiveVolume}
            onChange={playback.setVolume}
            onToggleMute={playback.toggleMute}
          />
        </div>
      </section>
    </div>
  );
};
