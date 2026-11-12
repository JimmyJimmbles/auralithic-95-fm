import type { CSSProperties } from 'react';
import { artistCatalogHref, artistRadioHref } from '../lib/site.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { formatElapsed, formatTime } from '../lib/time.ts';
import { Artwork } from './Artwork.tsx';
import { Icon } from './Icon.tsx';
import { LikeControl } from './LikeControl.tsx';
import { VolumeControl } from './VolumeControl.tsx';

const bars = Array.from({ length: 12 }, (_, index) => index);

export const StationView = ({
  stationName = 'Auralithic Collective',
  channel = '00',
  signalCaption = 'COLLECTIVE RADIO',
  connectingDetail = 'Tuning the collective.',
}: {
  stationName?: string;
  channel?: string;
  signalCaption?: string;
  connectingDetail?: string;
}) => {
  const playback = usePlayback();
  const catalog = useCatalog();
  const current = playback.current;
  const artist = current ? catalog.artists[current.artist] : undefined;
  const release = current ? catalog.releases[current.release] : undefined;
  const connecting = !catalog.ready || playback.connecting;
  const signal = connecting ? 'Connecting' : playback.playing ? 'On air' : 'Standby';
  const label = playback.playing ? 'Pause' : 'Play';
  const duration = playback.duration || current?.length || 0;
  const percentage = duration ? Math.min(100, Math.max(0, (playback.position / duration) * 100)) : 0;

  return (
    <section className="dial" aria-label="Collective radio player">
      <div className="radio-channel-strip">
        <img src="/icons/radio.svg" width={16} height={16} alt="" />
        <span>{release?.name ?? stationName}</span>
        <span className="channel-number">CH {channel}</span>
      </div>
      <div className="dial-cover" id="dial-cover">
        {current ? <Artwork art={current.art} alt={release ? `Cover art for ${release.name}` : ''} fadeMs={480} /> : null}
      </div>
      <fieldset className="radio-group now-playing-group">
        <legend>Currently Playing</legend>
        <div className="dial-meta">
          <div id="dial-identity" aria-live="polite">
            {current && artist && !connecting ? (
              <>
                <h2>{current.name}</h2>
                <a href={stationName === 'Auralithic Collective' ? artistRadioHref(current.artist) : artistCatalogHref(current.artist)}>{artist.name} <Icon name="diagonal" /></a>
              </>
            ) : connecting ? (
              <>
                <p className="playing-label">Please stand by</p>
                <h2>Connecting to radio</h2>
                <p>{connectingDetail}</p>
              </>
            ) : (
              <>
                <p className="playing-label">Station standby</p>
                <h2>No published tracks yet</h2>
                <p>The next release will appear here.</p>
              </>
            )}
          </div>
          <LikeControl trackId={current?.id} />
        </div>
      </fieldset>
      <div className="player-display" aria-label="Playback status">
        <div className="display-clock">
          <span className="display-caption">ELAPSED</span>
          <span className="digital-elapsed">{formatElapsed(playback.position)}</span>
        </div>
        <div className="signal-display">
          <span className="dial-signal"><i /><span id="dial-signal">{signal}</span></span>
          <div className="signal-bars" aria-hidden="true">
            {bars.map((index) => <i key={index} style={{ '--bar': index } as CSSProperties} />)}
          </div>
          <span className="display-caption">{signalCaption}</span>
        </div>
      </div>
      <div
        className="track-progress"
        role="progressbar"
        aria-label="Current track progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percentage)}
        aria-valuetext={`${formatTime(playback.position)} of ${formatTime(duration)}`}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <div className="dial-controls">
        <button type="button" className="play-button" aria-label={label} disabled={!current} onClick={playback.toggle}>
          <Icon name={playback.playing ? 'pause' : 'play'} />
          {label}
        </button>
        <div className="radio-volume">
          <span className="volume-caption">Volume</span>
          <VolumeControl
            label="Station volume"
            value={playback.effectiveVolume}
            onChange={playback.setVolume}
            onToggleMute={playback.toggleMute}
          />
        </div>
      </div>
      <div className="radio-player-footnote">
        <span>Random rotation</span>
        <span>auralithic.fm</span>
      </div>
    </section>
  );
};
