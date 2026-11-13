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
  follow: (scope: string) => void;
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
  beginPlay: (id: string) => void,
  catalog: CatalogData,
) => {
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const audioRef = useRef<HTMLAudioElement>(null);
  const queueRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const stationRef = useRef('station');
  const followRef = useRef<string | null>(null);
  const detachedRef = useRef(false);
  const refreshingRef = useRef(false);
  const liveRefreshRef = useRef<(scope: string) => void>(() => undefined);
  type LiveProgram = {
    offsetMs: number;
    endsAt: number;
    receivedAt: number;
    tracks: { id: string; durationMs: number }[];
  };
  const programRef = useRef<LiveProgram | null>(null);
  const wantsRef = useRef(false);
  const listenedRef = useRef(0);
  const lastRef = useRef(0);
  const countedRef = useRef(false);
  const notifyRef = useRef(notify);
  const recordRef = useRef(recordPlay);
  const beginRef = useRef(beginPlay);
  useLayoutEffect(() => {
    notifyRef.current = notify;
    recordRef.current = recordPlay;
    beginRef.current = beginPlay;
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
    audio.pause();
    const nextSrc = audioUrl(track);
    const sameSource = audio.getAttribute('src') === nextSrc;
    audio.src = nextSrc;
    if (sameSource) audio.load();
    const start = () => {
      audio.removeEventListener('loadedmetadata', start);
      if (offset > 0) audio.currentTime = offset;
      if (shouldPlay) void play();
    };
    audio.addEventListener('loadedmetadata', start);
    publishSession();
    if (shouldPlay) beginRef.current(track.id);
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
    if (followRef.current) {
      liveRefreshRef.current(followRef.current);
      return;
    }
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
    if (followRef.current) {
      if (detachedRef.current || audio.paused) {
        detachedRef.current = false;
        wantsRef.current = true;
        liveRefreshRef.current(followRef.current);
        return;
      }
      detachedRef.current = true;
      pause();
      return;
    }
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

  const placeLive = useCallback((program: LiveProgram, snap: boolean) => {
    const total = program.tracks.reduce((sum, cut) => sum + cut.durationMs, 0);
    if (total <= 0) {
      selectTrack(null, false);
      return;
    }
    const elapsed = Math.min(total - 1, Math.max(0, program.offsetMs + (Date.now() - program.receivedAt)));
    let cursor = 0;
    for (const cut of program.tracks) {
      if (cursor + cut.durationMs <= elapsed) {
        cursor += cut.durationMs;
        continue;
      }
      const track = catalogRef.current.tracks.find((item) => item.id === cut.id) ?? null;
      const offset = (elapsed - cursor) / 1000;
      const audio = audioRef.current;
      if (!snap && detachedRef.current) return;
      if (track && currentRef.current?.id === track.id && audio && audio.getAttribute('src')) {
        if (audio.ended) return;
        if (Math.abs(audio.currentTime - offset) > 2.5 && !audio.seeking) {
          const afterSeek = () => {
            audio.removeEventListener('seeked', afterSeek);
            if (wantsRef.current && audio.paused) void play();
          };
          audio.addEventListener('seeked', afterSeek);
          audio.currentTime = offset;
          return;
        }
        if (audio.paused && wantsRef.current) void play();
        return;
      }
      wantsRef.current = true;
      selectTrack(track, true, offset);
      return;
    }
  }, [play, selectTrack]);

  const refreshLive = useCallback(async (scope: string) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const response = await fetch(`/api/live/${encodeURIComponent(scope)}`, { cache: 'no-store' });
      if (!response.ok || followRef.current !== scope) return;
      const body = await response.json() as { offsetMs: number; endsAt: string; tracks: { id: string; durationMs: number }[] };
      const program: LiveProgram = {
        offsetMs: body.offsetMs,
        endsAt: Date.parse(body.endsAt),
        receivedAt: Date.now(),
        tracks: body.tracks,
      };
      programRef.current = program;
      stationRef.current = scope;
      setStationId(scope);
      placeLive(program, true);
    } finally {
      refreshingRef.current = false;
    }
  }, [placeLive]);

  useEffect(() => {
    liveRefreshRef.current = (scope) => {
      void refreshLive(scope);
    };
  }, [refreshLive]);

  const follow = useCallback((scope: string) => {
    if (followRef.current === scope && programRef.current) return;
    detachedRef.current = false;
    wantsRef.current = true;
    followRef.current = scope;
    stationRef.current = scope;
    setStationId(scope);
    void refreshLive(scope);
  }, [refreshLive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const scope = followRef.current;
      const program = programRef.current;
      if (!scope || !program || detachedRef.current) return;
      if (Date.now() >= program.endsAt - 300) {
        void refreshLive(scope);
        return;
      }
      placeLive(program, false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [placeLive, refreshLive]);

  const playTrack = useCallback((scope: string, trackId: string) => {
    if (followRef.current) {
      const audio = audioRef.current;
      if (detachedRef.current || audio?.paused) {
        detachedRef.current = false;
        wantsRef.current = true;
        void refreshLive(followRef.current);
        return;
      }
      if (currentRef.current?.id === trackId) {
        detachedRef.current = true;
        pause();
      }
      return;
    }
    const audio = audioRef.current;
    if (stationRef.current === scope && currentRef.current?.id === trackId) {
      if (audio?.paused) void play();
      return;
    }
    tuneScope(scope, true, trackId);
  }, [pause, play, refreshLive, tuneScope]);

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
    follow,
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
  const catalog = useCatalog();
  const { counts, beginPlay, recordPlay } = usePlayCounts(catalog);
  const engine = usePlaybackEngine(notify, recordPlay, beginPlay, catalog);
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
    follow: engine.follow,
    returnToCollective: engine.returnToCollective,
  };

  return (
    <PlaybackContext.Provider value={playback}>
      {children}
      <audio ref={engine.audioRef} className="station-audio" preload="auto" />
    </PlaybackContext.Provider>
  );
};
