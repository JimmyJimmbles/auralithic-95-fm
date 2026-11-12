import { useState } from 'react';
import { likeText } from '../lib/time.ts';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { Icon } from './Icon.tsx';

export const LikeControl = ({ trackId }: { trackId: string | undefined }) => {
  const { liked, likeCount, toggleLike } = usePlayback();
  const [beat, setBeat] = useState(false);
  const isLiked = trackId ? liked(trackId) : false;
  const total = trackId ? likeCount(trackId) : 0;

  const onClick = () => {
    if (!trackId) return;
    const willLike = !liked(trackId);
    toggleLike(trackId);
    if (!willLike) {
      setBeat(false);
      return;
    }
    setBeat(false);
    window.requestAnimationFrame(() => setBeat(true));
  };

  return (
    <div className="like-control">
      <button
        type="button"
        className={beat && isLiked ? 'icon-button heart-button beat' : 'icon-button heart-button'}
        aria-label="Like track"
        aria-pressed={isLiked}
        title={isLiked ? 'Unlike track' : 'Like track'}
        disabled={!trackId}
        onClick={onClick}
      >
        <Icon name="heart" />
      </button>
      <span className="like-count" aria-live="polite">{likeText(total)}</span>
    </div>
  );
};
