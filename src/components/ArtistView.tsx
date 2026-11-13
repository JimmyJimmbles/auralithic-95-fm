import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { coverUrl, rotationOf } from '../data/catalog.ts';
import { collectiveOrigin } from '../lib/site.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';
import { usePlayback } from '../hooks/usePlayback.tsx';
import { Icon } from './Icon.tsx';
import { TrackList } from './TrackList.tsx';

const artistTabs = [
  ['tracks', 'Tracks'],
  ['releases', 'Releases'],
  ['about', 'About & links'],
] as const;

type ArtistTab = (typeof artistTabs)[number][0];
type ReleaseFilter = 'all' | 'album' | 'single';

const filters: readonly (readonly [ReleaseFilter, string])[] = [
  ['all', 'All releases'],
  ['album', 'Albums'],
  ['single', 'Singles'],
];

export const ArtistView = ({ slug }: { slug: string }) => {
  const catalog = useCatalog();
  const artist = catalog.artists[slug];
  const playback = usePlayback();
  const [tab, setTab] = useState<ArtistTab>('tracks');
  const [filter, setFilter] = useState<ReleaseFilter>('all');
  const [openRelease, setOpenRelease] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const focusRelease = useRef<string | null>(null);
  const allTracks = rotationOf(catalog, slug);
  const needle = query.trim().toLowerCase();
  const tracks = allTracks.filter((track) => {
    if (!needle) return true;
    const releaseName = catalog.releases[track.release]?.name ?? '';
    return track.name.toLowerCase().includes(needle) || releaseName.toLowerCase().includes(needle);
  });
  const plays = allTracks.reduce((sum, track) => sum + (playback.playCounts[track.id] ?? 0), 0);
  const filtered = Object.entries(catalog.releases).filter(([, release]) => {
    if (release.artist !== slug) return false;
    if (filter !== 'all' && release.type.toLowerCase() !== filter) return false;
    if (!needle) return true;
    return release.name.toLowerCase().includes(needle);
  });
  const visibleRelease = filtered.some(([id]) => id === openRelease) ? openRelease : null;
  const tunedHere = playback.stationId === slug;
  const transport = playback.playing ? 'Pause' : 'Play';

  useEffect(() => {
    const id = focusRelease.current;
    if (!id) return;
    focusRelease.current = null;
    document.getElementById(`release-${id}`)?.focus({ preventScroll: true });
  }, [openRelease, tab]);

  if (!artist) {
    return <p className="empty">This artist is not on the station yet.</p>;
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    const index = artistTabs.findIndex(([id]) => id === tab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? artistTabs.length - 1
        : (index + (event.key === 'ArrowLeft' ? -1 : 1) + artistTabs.length) % artistTabs.length;
    const next = artistTabs[nextIndex]?.[0];
    if (!next) return;
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(`artist-tab-${next}`)?.focus());
  };

  const chooseRelease = (id: string) => {
    focusRelease.current = id;
    setOpenRelease((current) => (current === id ? null : id));
  };

  return (
    <>
      <div className="explorer-address">
        <a
          href={`${collectiveOrigin()}/artists`}
          className="back-link"
          onClick={(event) => {
            if (window.history.length <= 1) return;
            event.preventDefault();
            window.history.back();
          }}
        >
          <Icon name="back" /> Back
        </a>
        <div>
          <img src="/icons/folder.svg" width={16} height={16} alt="" />
          Artists\{artist.name}
        </div>
        <label className="catalog-search">
          Find
          <input type="search" value={query} aria-label="Find in this catalog" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <header className="artist-intro">
        <div className="artist-picture-frame">
          <img className="portrait" src={coverUrl(artist.art)} width={72} height={72} alt="" />
        </div>
        <div className="artist-profile-identity">
          <p className="artist-channel">Artist station · CH {artist.id}</p>
          <h1>{artist.name}</h1>
          <p className="artist-genre">{artist.style}</p>
          <span className="artist-state"><i /> Auralithic Collective</span>
        </div>
        <fieldset className="artist-stat radio-group">
          <legend>Listening</legend>
          <strong id="artist-plays">{plays.toLocaleString()}</strong>
          <span>plays on this device</span>
        </fieldset>
      </header>
      <section className="artist-file">
        <div className="property-tabs" role="tablist" aria-label="Artist catalog">
          {artistTabs.map(([id, label]) => (
            <button
              key={id}
              id={`artist-tab-${id}`}
              type="button"
              role="tab"
              aria-controls="artist-content"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={onTabKeyDown}
            >
              {label}
            </button>
          ))}
        </div>
        <div id="artist-content" className={`property-content${tab === 'tracks' ? ' is-tracks' : ''}`} role="tabpanel" aria-labelledby={`artist-tab-${tab}`}>
          {tab === 'tracks' ? (
            <>
              <div className="artist-track-toolbar">
                <span>
                  <img src="/icons/radio.svg" width={15} height={15} alt="" />
                  {' Artist radio'}
                </span>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (tunedHere) playback.toggle();
                    else playback.follow(slug);
                  }}
                >
                  <Icon name={tunedHere ? (playback.playing ? 'pause' : 'play') : 'shuffle'} />
                  {tunedHere ? `${transport} radio` : 'Tune in'}
                </button>
              </div>
              <TrackList items={tracks} scope={slug} />
            </>
          ) : null}
          {tab === 'releases' ? (
            <>
              <div className="release-toolbar">
                <span>Show</span>
                <div className="filter-group" role="group" aria-label="Release filters">
                  {filters.map(([id, label]) => (
                    <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div id="release-list">
                {filtered.length > 0 ? (
                  <div className="release-grid">
                    {filtered.map(([id, item]) => (
                      <button
                        key={id}
                        id={`release-${id}`}
                        type="button"
                        className="release-card"
                        aria-expanded={visibleRelease === id}
                        aria-controls="release-detail"
                        onClick={() => chooseRelease(id)}
                      >
                        <img src={coverUrl(item.art)} alt="" width={55} height={55} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.type} · {item.year}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty">No {filter === 'album' ? 'albums' : 'singles'} in this catalog.</p>
                )}
              </div>
              <div id="release-detail">
                {visibleRelease && catalog.releases[visibleRelease] ? (
                  <div className="release-detail">
                    <h3><span aria-hidden="true">♪</span> {catalog.releases[visibleRelease].name}</h3>
                    <TrackList items={tracks.filter((track) => track.release === visibleRelease)} scope={slug} />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {tab === 'about' ? (
            <div className="artist-properties">
              <fieldset className="radio-group">
                <legend>About {artist.name}</legend>
                <p className="artist-about-bio">{artist.bio}</p>
                <dl>
                  <dt>Genre</dt>
                  <dd>{artist.style}</dd>
                  <dt>Station</dt>
                  <dd>Channel {artist.id} · Artist radio</dd>
                </dl>
              </fieldset>
              <fieldset className="radio-group">
                <legend>Find the artist</legend>
                <div className="artist-links">
                  {artist.links.map(([label, url]) => (
                    <a key={url} className="chip" href={url} target="_blank" rel="noopener noreferrer">
                      {label} <Icon name="diagonal" />
                    </a>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
};
