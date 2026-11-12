import { useCatalog } from '../hooks/useCatalog.tsx';
import { type Track } from '../data/catalog.ts';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { formatTime } from '../lib/time.ts';
import { Icon } from './Icon.tsx';

export const TrackList = ({ items, scope }: { items: readonly Track[]; scope: string }) => {
  const playback = usePlayback();
  const catalog = useCatalog();
  const total = items.reduce((sum, track) => sum + track.length, 0);
  return (
    <>
      <div className="track-directory">
        <div className="track-columns" aria-hidden="true">
          <span>#</span>
          <span>Title</span>
          <span>Release</span>
          <span>Likes</span>
          <span>Length</span>
          <span />
        </div>
        <div className="track-list-scroll">
          <ul className="track-list">
          {items.length === 0 ? <li className="folder-empty">There are no published tracks here yet.</li> : items.map((track, index) => {
            const current = playback.current?.id === track.id;
            return (
              <li key={track.id}>
                <button
                  type="button"
                  className="track-row"
                  data-current={current ? 'true' : 'false'}
                  aria-label={`Play ${track.name}`}
                  onClick={() => playback.playTrack(scope, track.id)}
                >
                  <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="track-name">
                    <span className="music-file-icon" aria-hidden="true">♪</span>
                    <strong>{track.name}</strong>
                  </span>
                  <span className="track-release">{catalog.releases[track.release]?.name}</span>
                  <span className="like-count track-like-count">{playback.likeCount(track.id).toLocaleString()}</span>
                  <span className="duration">{formatTime(track.length)}</span>
                  <span className="track-row-play"><Icon name="play" /></span>
                </button>
              </li>
            );
          })}
          </ul>
        </div>
      </div>
      <div className="track-list-footer">
        <span>{items.length} track{items.length === 1 ? '' : 's'}</span>
        <span>{formatTime(total)} total</span>
      </div>
    </>
  );
};
