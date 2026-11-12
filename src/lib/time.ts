export const formatTime = (time: number): string => {
  const safe = Number.isFinite(time) ? Math.max(0, time) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const formatElapsed = (time: number): string => formatTime(time).padStart(5, '0');

export const likeText = (total: number): string =>
  `${total.toLocaleString()} ${total === 1 ? 'like' : 'likes'}`;
