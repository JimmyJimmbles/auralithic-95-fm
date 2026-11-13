import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { audioUrl, coverUrl, rotationOf, stationLabel, type CatalogData, type Track } from '../data/catalog.ts';
import { dealSpread } from '../lib/shuffle.ts';
import { readBoolean, readNumber, writeStationSession, writeStorage } from '../lib/storage.ts';
import { useCatalog } from './useCatalog.tsx';
import { useLikes, type LikeStore } from './useLikes.ts';
import { usePalette } from './usePalette.ts';
import { usePlayCounts } from './usePlayCounts.ts';

export type Playback = LikeStore & {
  current: Track | null;
  stationId: string;
  playing: boolean;
  connecting: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  effectiveVolume: number;
  playCounts: Record<string, number>;
  toggle: () => void;
  pause: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  tune: (scope: string) => void;
  playTrack: (scope: string, trackId: string) => void;
  restore: (scope: string, trackId: string | null, position: number) => void;
  returnToCollective: () => void;
};

const PlaybackContext = createContext<Playback | null>(null);

const groupOf = (scope: string) => (track: Track): string =>
  scope === 'station' ? track.artist : track.release;

const errorName = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';

const usePlaybackEngine = (
  notify: (message: string) => void,
  recordPlay: (id: string) => void,
  catalog: CatalogData,
) => {
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const audioRef = useRef<HTMLAudioElement>(null);
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const stationRef = useRef('station');
  const wantsRef = useRef(false);
  const listenedRef = useRef(0);
  const lastRef = useRef(0);
  const countedRef = useRef(false);
  const notifyRef = useRef(notify);
  const recordRef = useRef(recordPlay);
  useLayoutEffect(() => {
    notifyRef.current = notify;
    recordRef.current = recordPlay;
  });

  const [current, setCurrent] = useState<Track | null>(null);
  const [stationId, setStationId] = useState('station');
  const [playing, setPlaying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const stored = readNumber('volume', 0.75);
    return Math.min(1, Math.max(0, stored));
  });
  const [muted, setMuted] = useState(() => readBoolean('muted', false));
  const initialVolume = useRef(volume);
  const initialMuted = useRef(muted);

  const publishSession = useCallback(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = audioRef.current;
    const track = currentRef.current;
    const active = Boolean(audio && !audio.paused && !audio.ended);
    try {
      navigator.mediaSession.playbackState = active ? 'playing' : 'paused';
    } catch {
      // Some browsers reject playbackState writes.
    }
    if (!track || typeof MediaMetadata === 'undefined') return;
    const artist = catalogRef.current.artists[track.artist];
    if (!artist) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: artist.name,
        album: stationLabel(stationRef.current, catalogRef.current.artists),
        artwork: [{
          src: new URL(coverUrl(track.art), window.location.href).href,
          sizes: '512x512',
          type: 'image/webp',
        }],
      });
    } catch {
      // Ignore browsers that reject a metadata payload.
    }
  }, []);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    const track = currentRef.current;
    if (!audio || !track) {
      notifyRef.current('There are no published tracks in this rotation yet.');
      return;
    }
    wantsRef.current = true;
    if (audio.ended) {
      listenedRef.current = 0;
      countedRef.current = false;
      lastRef.current = 0;
    }
    if (audio.error) audio.load();
    try {
      await audio.play();
    } catch (error) {
      const name = errorName(error);
      if (currentRef.current !== track || name === 'AbortError') return;
      if (name === 'NotAllowedError') {
        wantsRef.current = true;
        setConnecting(true);
        setPlaying(false);
        return;
      }
      wantsRef.current = false;
      setPlaying(false);
      setConnecting(false);
      notifyRef.current('Playback couldn’t start. Press play to try again.');
    }
  }, []);

  const pause = useCallback(() => {
    wantsRef.current = false;
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const selectTrack = useCallback((track: Track | null, shouldPlay: boolean, offset = 0) => {
    const audio = audioRef.current;
    currentRef.current = track;
    listenedRef.current = 0;
    lastRef.current = 0;
    countedRef.current = false;
    wantsRef.current = Boolean(track) && shouldPlay;
    setConnecting(Boolean(track) && shouldPlay);
    setCurrent(track);
    setPosition(offset);
    setDuration(track?.length ?? 0);
    writeStationSession(stationRef.current, track?.id ?? null, offset);
    if (!audio) return;
    if (!track) {
      audio.pause();
      audio.removeAttribute('src');
      setPlaying(false);
      publishSession();
      return;
    }
    const nextSrc = audioUrl(track);
    const sameSource = audio.getAttribute('src') === nextSrc;
    audio.src = nextSrc;
    if (sameSource) audio.load();
    if (offset > 0) {
      const seek = () => {
        audio.currentTime = offset;
        audio.removeEventListener('loadedmetadata', seek);
      };
      audio.addEventListener('loadedmetadata', seek);
    }
    publishSession();
    if (shouldPlay) void play();
    else {
      audio.pause();
      setPlaying(false);
    }
  }, [play, publishSession]);

  const tuneScope = useCallback((scope: string, autoplay: boolean, trackId?: string, offset = 0) => {
    stationRef.current = scope;
    setStationId(scope);
    const group = groupOf(scope);
    const rotation = rotationOf(catalogRef.current, scope);
    const chosen = trackId ? rotation.find((track) => track.id === trackId) : undefined;
    if (chosen) {
      queueRef.current = dealSpread(
        rotation.filter((track) => track.id !== chosen.id),
        group,
      );
      selectTrack(chosen, autoplay, offset);
      return;
    }
    const queue = dealSpread(rotation, group);
    const first = queue.shift() ?? null;
    queueRef.current = queue;
    selectTrack(first, autoplay);
  }, [selectTrack]);

  const continueRotation = useCallback(() => {
    const ended = currentRef.current;
    if (!ended) return;
    if (queueRef.current.length === 0) {
      const scope = stationRef.current;
      queueRef.current = dealSpread(rotationOf(catalogRef.current, scope), groupOf(scope), (track) => track.id === ended.id);
    }
    selectTrack(queueRef.current.shift() ?? ended, true);
  }, [selectTrack]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (wantsRef.current && !audio.ended) pause();
    else void play();
  }, [pause, play]);

  const setVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = Math.min(1, Math.max(0, value));
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.volume === 0) {
      audio.volume = 0.65;
      audio.muted = false;
      return;
    }
    audio.muted = !audio.muted;
  }, []);

  const tune = useCallback((scope: string) => tuneScope(scope, true), [tuneScope]);

  const restore = useCallback((scope: string, trackId: string | null, offset: number) => {
    tuneScope(scope, true, trackId ?? undefined, offset);
  }, [tuneScope]);

  const playTrack = useCallback((scope: string, trackId: string) => {
    const audio = audioRef.current;
    if (stationRef.current === scope && currentRef.current?.id === trackId) {
      if (audio?.paused) void play();
      return;
    }
    tuneScope(scope, true, trackId);
  }, [play, tuneScope]);

  const returnToCollective = useCallback(() => {
    if (stationRef.current === 'station') return;
    tuneScope('station', wantsRef.current);
  }, [tuneScope]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      const element = audioRef.current;
      const track = currentRef.current;
      if (!element) return;
      const nextPosition = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      const nextDuration = Number.isFinite(element.duration) ? element.duration : track?.length ?? 0;
      setPosition(nextPosition);
      setDuration(nextDuration);
      const delta = nextPosition - lastRef.current;
      lastRef.current = nextPosition;
      if (!track || countedRef.current || element.paused || element.seeking || delta <= 0 || delta >= 1.5) return;
      listenedRef.current += delta;
      if (listenedRef.current < 10) return;
      countedRef.current = true;
      recordRef.current(track.id);
    };

    const onSeeked = () => {
      const element = audioRef.current;
      if (element) lastRef.current = element.currentTime;
    };

    const onTransport = () => {
      const element = audioRef.current;
      if (!element) return;
      const playingNow = !element.paused && !element.ended;
      setPlaying(playingNow);
      if (playingNow || !wantsRef.current) setConnecting(false);
      publishSession();
    };

    const onError = () => {
      const element = audioRef.current;
      if (!element?.error || !currentRef.current) return;
      if (element.error.code === MediaError.MEDIA_ERR_ABORTED) return;
      wantsRef.current = false;
      setPlaying(false);
      setConnecting(false);
      publishSession();
      notifyRef.current('This track couldn’t load. Press play to retry.');
    };

    const onVolume = () => {
      const element = audioRef.current;
      if (!element) return;
      setVolumeState(element.volume);
      setMuted(element.muted);
      writeStorage('volume', element.volume);
      writeStorage('muted', element.muted);
    };

    const remember = () => {
      const element = audioRef.current;
      writeStationSession(stationRef.current, currentRef.current?.id ?? null, element?.currentTime ?? 0);
    };
    window.addEventListener('pagehide', remember);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('loadedmetadata', onTime);
    audio.addEventListener('playing', onTransport);
    audio.addEventListener('pause', onTransport);
    audio.addEventListener('ended', continueRotation);
    audio.addEventListener('error', onError);
    audio.addEventListener('volumechange', onVolume);

    audio.volume = initialVolume.current;
    audio.muted = initialMuted.current;
    const track = currentRef.current;
    if (track) {
      audio.src = audioUrl(track);
      publishSession();
    }

    const resume = () => {
      const element = audioRef.current;
      const active = currentRef.current;
      if (!wantsRef.current || !element || !active || !element.paused) return;
      void element.play().catch(() => undefined);
    };
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('keydown', resume, true);

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          void play();
        });
      } catch {
        // Media Session actions vary by browser.
      }
      try {
        navigator.mediaSession.setActionHandler('pause', () => {
          pause();
        });
      } catch {
        // Media Session actions vary by browser.
      }
    }

    return () => {
      window.removeEventListener('pagehide', remember);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('loadedmetadata', onTime);
      audio.removeEventListener('playing', onTransport);
      audio.removeEventListener('pause', onTransport);
      audio.removeEventListener('ended', continueRotation);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('volumechange', onVolume);
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('keydown', resume, true);
      if (!('mediaSession' in navigator)) return;
      try { navigator.mediaSession.setActionHandler('play', null); } catch { /* unsupported */ }
      try { navigator.mediaSession.setActionHandler('pause', null); } catch { /* unsupported */ }
    };
  }, [continueRotation, pause, play, publishSession]);

  const trackKey = catalog.tracks.map((track) => track.id).join('\n');
  const aligned = useRef('');
  useEffect(() => {
    if (!catalog.ready) return;
    const key = trackKey;
    const playingNow = currentRef.current;
    const next = playingNow ? catalog.tracks.find((track) => track.id === playingNow.id) : undefined;
    if (next) {
      aligned.current = key;
      if (next !== playingNow) {
        currentRef.current = next;
        setCurrent(next);
      }
      return;
    }
    if (!playingNow) {
      aligned.current = key;
      return;
    }
    if (aligned.current === key) return;
    aligned.current = key;
    tuneScope(stationRef.current, wantsRef.current);
  }, [catalog.ready, catalog.tracks, trackKey, tuneScope]);

  return {
    audioRef,
    track: current,
    stationId,
    playing,
    connecting,
    position,
    duration,
    volume,
    muted,
    toggle,
    pause,
    setVolume,
    toggleMute,
    tune,
    playTrack,
    restore,
    returnToCollective,
  };
};

export const usePlayback = (): Playback => {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used within PlaybackProvider');
  return value;
};

export const PlaybackProvider = ({ children, notify }: { children: ReactNode; notify: (message: string) => void }) => {
  const likes = useLikes();
  const { counts, recordPlay } = usePlayCounts();
  const catalog = useCatalog();
  const engine = usePlaybackEngine(notify, recordPlay, catalog);
  usePalette(engine.track?.art);

  const playback: Playback = {
    ...likes,
    current: engine.track,
    stationId: engine.stationId,
    playing: engine.playing,
    connecting: engine.connecting,
    position: engine.position,
    duration: engine.duration,
    volume: engine.volume,
    muted: engine.muted,
    effectiveVolume: engine.muted ? 0 : engine.volume,
    playCounts: counts,
    toggle: engine.toggle,
    pause: engine.pause,
    setVolume: engine.setVolume,
    toggleMute: engine.toggleMute,
    tune: engine.tune,
    playTrack: engine.playTrack,
    restore: engine.restore,
    returnToCollective: engine.returnToCollective,
  };

  return (
    <PlaybackContext.Provider value={playback}>
      {children}
      <audio ref={engine.audioRef} className="station-audio" preload="auto" />
    </PlaybackContext.Provider>
  );
};
