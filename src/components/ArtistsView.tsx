import { useState } from 'react';
import { coverUrl, rotationOf } from '../data/catalog.ts';
import { artistRadioHref } from '../lib/site.ts';
import { useCatalog } from '../hooks/useCatalog.tsx';

export const ArtistsView = () => {
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const entries = Object.entries(catalog.artists).filter(([, artist]) => {
    if (!needle) return true;
    return artist.name.toLowerCase().includes(needle) || artist.style.toLowerCase().includes(needle);
  });
  return (
    <>
      <div className="explorer-address">
        <span>Address</span>
        <div>
          <img src="/icons/folder.svg" width={16} height={16} alt="" />
          Auralithic Collective\Artists
        </div>
        <label className="catalog-search">
          Find
          <input type="search" value={query} aria-label="Find an artist" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="artist-explorer">
        <aside className="explorer-description">
          <img src="/icons/folder.svg" width={44} height={44} alt="" />
          <h2>Artists</h2>
          <hr />
          <p>Open an artist to explore their music and tune into their station.</p>
          <small>{entries.length} artist stations</small>
        </aside>
        <div className="artist-directory">
          <div className="directory-columns" aria-hidden="true">
            <span>Name</span>
            <span>Genre</span>
            <span>Tracks</span>
          </div>
          <div className="roster-scroll">
            <div className="roster-grid">
            {entries.length === 0 ? <p className="empty">No artists yet.</p> : null}
            {entries.map(([id, artist]) => (
              <a key={id} className="artist-card" href={artistRadioHref(id)}>
                <span className="artist-directory-name">
                  <img src={coverUrl(artist.art)} alt="" />
                  <strong>{artist.name}</strong>
                </span>
                <small>{artist.style}</small>
                <span className="artist-track-count">{rotationOf(catalog, id).length}</span>
              </a>
            ))}
            </div>
          </div>
          <div className="directory-footnote">Select an artist to open their station.</div>
        </div>
      </div>
    </>
  );
};
