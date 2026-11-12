import type { AdminArtist, AdminRelease, AdminTrack } from './types.ts';
import { mediaUrl } from './types.ts';

export type ReleaseFilter = 'all' | 'published' | 'draft';

export const ReleaseLibrary = ({
  releases,
  tracks,
  artists,
  filter,
  artistSlug,
  search,
  selected,
  onFilter,
  onSelect,
  onOpen,
  onDelete,
}: {
  releases: AdminRelease[];
  tracks: AdminTrack[];
  artists: AdminArtist[];
  filter: ReleaseFilter;
  artistSlug: string;
  search: string;
  selected: string;
  onFilter: (filter: ReleaseFilter) => void;
  onSelect: (slug: string) => void;
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => void;
}) => {
  const artistName = (slug: string) => artists.find((artist) => artist.slug === slug)?.name ?? slug;
  const query = search.trim().toLowerCase();
  const rows = releases.filter((release) => {
    const name = artistName(release.artistSlug).toLowerCase();
    const matchesArtist = !artistSlug || release.artistSlug === artistSlug;
    const matchesFilter = filter === 'all' || release.status === filter;
    const matchesSearch = !query || release.title.toLowerCase().includes(query) || name.includes(query);
    return matchesArtist && matchesFilter && matchesSearch;
  });
  const countFor = (key: ReleaseFilter) => releases.filter((release) => {
    const matchesArtist = !artistSlug || release.artistSlug === artistSlug;
    return matchesArtist && (key === 'all' || release.status === key);
  }).length;
  const trackCount = (slug: string) => tracks.filter((track) => track.releaseSlug === slug).length;
  const current = rows.find((release) => release.slug === selected);

  return (
    <>
      <header className="library-heading">
        <img src="/icons/folder.svg" alt="" />
        <div>
          <h1>{artistSlug ? artistName(artistSlug) : 'Your releases'}</h1>
          <p>A home for every single, album, and little experiment.</p>
        </div>
        <div className="heading-count">
          <strong>{rows.reduce((total, release) => total + trackCount(release.slug), 0)}</strong>
          tracks in this folder
        </div>
      </header>
      <div className="catalog-tabs" role="group" aria-label="Release status">
        {(['all', 'published', 'draft'] as const).map((key) => (
          <button
            key={key}
            type="button"
            className="catalog-tab"
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {key === 'all' ? 'All releases' : key === 'published' ? 'Published' : 'Drafts'}
            <span>{countFor(key)}</span>
          </button>
        ))}
      </div>
      <section className="library-panel">
        <div className="table-scroll">
          {rows.length === 0 ? (
            <div className="empty-folder">
              <img src="/icons/folder.svg" alt="" />
              <strong>{query ? 'Nothing in this folder matches.' : 'A little space for something new.'}</strong>
              <p>{query ? 'Try another title or artist name.' : 'Start with a single or an album.'}</p>
            </div>
          ) : (
            <table className="catalog-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Artist</th>
                  <th scope="col">Type</th>
                  <th scope="col">Tracks</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((release) => (
                  <tr
                    key={release.slug}
                    className={release.slug === selected ? 'selected' : undefined}
                    aria-selected={release.slug === selected}
                    onClick={() => onSelect(release.slug)}
                    onDoubleClick={() => onOpen(release.slug)}
                  >
                    <td>
                      <span className="release-cell">
                        {release.coverKey ? <img src={mediaUrl(release.coverKey)} alt="" /> : <span className="cover-placeholder">♪</span>}
                        <span>
                          <strong>{release.title}</strong>
                          <small>{release.releaseDate}</small>
                        </span>
                      </span>
                    </td>
                    <td>{artistName(release.artistSlug)}</td>
                    <td>{release.type === 'album' ? 'Album' : 'Single'}</td>
                    <td>{trackCount(release.slug)}</td>
                    <td>
                      <span className="status-pill">
                        <i className={`status-dot${release.status === 'draft' ? ' draft' : ''}`} />
                        {release.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="selection-bar">
          <p>{current ? `${current.title} · ${trackCount(current.slug)} track${trackCount(current.slug) === 1 ? '' : 's'}` : 'Select a release. Double-click to open.'}</p>
          <button type="button" className="win-button" disabled={!current} onClick={() => current && onOpen(current.slug)}>Edit</button>
          <button
            type="button"
            className="win-button"
            disabled={!current}
            onClick={() => {
              if (!current) return;
              if (!window.confirm(`Delete “${current.title}” and its songs?`)) return;
              onDelete(current.slug);
            }}
          >
            Delete
          </button>
        </div>
      </section>
    </>
  );
};
