import { creditLine } from '../data/catalog.ts';
import { creditedSlugs } from './format.ts';
import type { Workspace } from './types.ts';
import { mediaUrl } from './types.ts';

export const Statistics = ({ workspace }: { workspace: Workspace }) => {
  const published = workspace.releases.filter((release) => release.status === 'published');
  const liveIds = new Set(published.map((release) => release.slug));
  const tracks = workspace.tracks.filter((track) => liveIds.has(track.releaseSlug));
  const streams = tracks.reduce((sum, track) => sum + (workspace.stats.streams[track.id] ?? 0), 0);
  const likes = tracks.reduce((sum, track) => sum + (workspace.stats.likes[track.id] ?? 0), 0);
  const artistName = (slug: string) => workspace.artists.find((artist) => artist.slug === slug)?.name ?? slug;

  return (
    <>
      <header className="library-heading">
        <img src="/icons/radio.svg" alt="" />
        <div>
          <h1>A little signal</h1>
          <p>Streams count after ten seconds of playback. Likes are one per listener.</p>
        </div>
      </header>
      <div className="statistics-overview">
        <div className="stat-panel"><small>Streams</small><strong>{streams.toLocaleString()}</strong></div>
        <div className="stat-panel"><small>Track likes</small><strong>{likes.toLocaleString()}</strong></div>
        <div className="stat-panel"><small>Tracks on air</small><strong>{tracks.length}</strong></div>
      </div>
      <section className="library-panel">
        <div className="table-scroll">
          {tracks.length === 0 ? (
            <div className="empty-folder">
              <img src="/icons/radio.svg" alt="" />
              <strong>Nothing on air yet.</strong>
              <p>Publish a release and the counts will collect here.</p>
            </div>
          ) : (
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Artists</th>
                  <th>Streams</th>
                  <th>Likes</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => {
                  const release = workspace.releases.find((item) => item.slug === track.releaseSlug);
                  return (
                    <tr key={track.id}>
                      <td>
                        <span className="release-cell">
                          {release?.coverKey ? <img src={mediaUrl(release.coverKey)} alt="" /> : <span>♪</span>}
                          <span>
                            <strong>{track.title}</strong>
                            <small>{release?.title}</small>
                          </span>
                        </span>
                      </td>
                      <td>{release ? creditLine(creditedSlugs(release).map(artistName)) : ''}</td>
                      <td>{(workspace.stats.streams[track.id] ?? 0).toLocaleString()}</td>
                      <td>{(workspace.stats.likes[track.id] ?? 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
};
