import { coverUrl, stationLabel } from '../data/catalog.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { formatElapsed } from '../lib/time.ts';
import { Icon } from './Icon.tsx';
import { LikeControl } from './LikeControl.tsx';
import { VolumeControl } from './VolumeControl.tsx';

export const MiniPlayer = ({ hidden }: { hidden: boolean }) => {
  const playback = usePlayback();
  const catalog = useCatalog();
  const current = playback.current;
  const label = playback.playing ? 'Pause' : 'Play';
  return (
    <section className="mini-player" id="mini-player" aria-label="Now playing" hidden={hidden}>
      <header className="mini-player-heading">
        Currently Playing
        <span>{formatElapsed(playback.position)}</span>
      </header>
      <div className="mini-track" id="mini-track">
        {current ? (
          <>
            <img src={coverUrl(current.art)} alt="" width={39} height={39} />
            <div>
              <p className="playing-label">Currently Playing</p>
              <strong>{current.name}</strong>
              <small>{stationLabel(playback.stationId, catalog.artists)}</small>
            </div>
          </>
        ) : (
          <div>
            <strong>No published tracks</strong>
            <small>Station standby</small>
          </div>
        )}
      </div>
      <div className="mini-controls">
        <div id="mini-like">
          <LikeControl trackId={current?.id} />
        </div>
        <button type="button" className="play-button" aria-label={label} disabled={!current} onClick={playback.toggle}>
          <Icon name={playback.playing ? 'pause' : 'play'} />
        </button>
      </div>
      <div id="mini-volume">
        <VolumeControl
          label="Artist player volume"
          value={playback.effectiveVolume}
          onChange={playback.setVolume}
          onToggleMute={playback.toggleMute}
        />
      </div>
    </section>
  );
};
