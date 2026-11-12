import { useEffect, useRef, useState } from 'react';
import { navigate } from '../hooks/useRoute.ts';
import { Notice } from '../components/Notice.tsx';
import { useClock } from '../hooks/useClock.ts';
import { useWindowDrag } from '../hooks/useWindowDrag.ts';
import { ArtistDirectory, ArtistEditor } from './Artists.tsx';
import { api, loadWorkspace } from './api.ts';
import { ReleaseEditor } from './ReleaseEditor.tsx';
import { ReleaseLibrary, type ReleaseFilter } from './ReleaseLibrary.tsx';
import { Statistics } from './Statistics.tsx';
import type { Workspace } from './types.ts';

type Screen =
  | { name: 'releases' }
  | { name: 'release'; slug: string | null; type: 'single' | 'album' }
  | { name: 'artists' }
  | { name: 'artist'; slug: string | null }
  | { name: 'statistics' };

export const AdminApp = () => {
  const [session, setSession] = useState<'checking' | 'in' | 'locked'>('locked');
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'releases' });
  const [filter, setFilter] = useState<ReleaseFilter>('all');
  const [artistSlug, setArtistSlug] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const windowRef = useRef<HTMLElement>(null);
  const drag = useWindowDrag(windowRef);
  const clock = useClock();

  const refresh = async () => {
    setWorkspace(await loadWorkspace());
  };

  useEffect(() => {
    document.body.classList.add('admin-page');
    document.body.classList.remove('radio-app', 'station-page');
    return () => {
      document.body.classList.remove('admin-page');
      document.body.classList.add('radio-app');
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const open = async () => {
      try {
        await api('/api/admin/me');
        const next = await loadWorkspace();
        if (cancel) return;
        setWorkspace(next);
        setSession('in');
      } catch {
        if (!cancel) setSession('locked');
      }
    };
    void open();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (!event.shiftKey || event.key.toLowerCase() !== 'a') return;
      event.preventDefault();
      setRevealed(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(id);
  }, [notice]);

  const unlock = async () => {
    try {
      await api('/api/admin/unlock', { method: 'POST', body: JSON.stringify({ password }) });
      const next = await loadWorkspace();
      setWorkspace(next);
      setPassword('');
      setSession('in');
    } catch {
      setPassword('');
    }
  };

  const logout = async () => {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    navigate('/');
  };

  if (session !== 'in' || !workspace) {
    return (
      <div className="admin-blank">
        {revealed ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void unlock();
            }}
          >
            <input
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              aria-label="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </form>
        ) : null}
      </div>
    );
  }

  const published = workspace.releases.filter((release) => release.status === 'published').length;
  const drafts = workspace.releases.length - published;
  const title = screen.name === 'statistics'
    ? 'Statistics · Catalog Manager'
    : screen.name === 'artists' || screen.name === 'artist'
      ? 'Artists · Catalog Manager'
      : 'Catalog Manager';

  return (
    <>
      <div className="desktop">
        <nav className="desktop-icons" aria-label="Desktop shortcuts">
          <a href="/"><img src="/icons/radio.svg" width={34} height={34} alt="" /><span>Auralithic<br />95 FM</span></a>
          <a href="/artists" onClick={(event) => { event.preventDefault(); setHidden(false); setScreen({ name: 'artists' }); }}>
            <span className="desktop-glyph" aria-hidden="true">♟</span><span>Artists</span>
          </a>
          <a href="#statistics" onClick={(event) => { event.preventDefault(); setHidden(false); setScreen({ name: 'statistics' }); }}>
            <span className="desktop-glyph statistics-glyph" aria-hidden="true">▣</span><span>Statistics</span>
          </a>
        </nav>
        <section className="program-window admin-window" ref={windowRef} hidden={hidden} aria-label="Catalog Manager window">
          <header
            className="titlebar"
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onLostPointerCapture={drag.onLostPointerCapture}
          >
            <span className="window-title">
              <img src="/icons/folder.svg" width={16} height={16} alt="" />
              <span>{title}</span>
            </span>
            <div className="window-controls">
              <button type="button" className="window-button minimize" aria-label="Minimize" onClick={() => setHidden(true)} />
              <button type="button" className="window-button close" aria-label="Close" onClick={() => setHidden(true)} />
            </div>
          </header>
          <nav className="program-menu admin-menu" aria-label="Catalog">
            <button type="button" onClick={() => setScreen({ name: 'releases' })}>Releases</button>
            <button type="button" onClick={() => setScreen({ name: 'artists' })}>Artists</button>
            <button type="button" onClick={() => setScreen({ name: 'statistics' })}>Statistics</button>
            <a className="radio-link" href="/">Open radio</a>
          </nav>
          {screen.name === 'releases' ? (
            <div className="admin-toolbar">
              <button type="button" className="win-button" disabled={workspace.artists.length === 0} onClick={() => setScreen({ name: 'release', slug: null, type: 'single' })}><span className="button-icon">♪</span> New single</button>
              <button type="button" className="win-button" disabled={workspace.artists.length === 0} onClick={() => setScreen({ name: 'release', slug: null, type: 'album' })}><span className="button-icon">▣</span> New album</button>
              <span className="toolbar-separator" />
              <button type="button" className="win-button" onClick={() => setScreen({ name: 'artist', slug: null })}><span className="button-icon">♟</span> New artist</button>
              <label className="toolbar-search">
                Find
                <input type="search" value={search} placeholder="Search catalog…" onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>
          ) : (
            <div className="admin-toolbar">
              {screen.name === 'artists' || screen.name === 'artist' ? (
                <button type="button" className="win-button" onClick={() => setScreen({ name: 'artist', slug: null })}><span className="button-icon">♟</span> New artist</button>
              ) : <span />}
            </div>
          )}
          <div className="admin-layout">
            <aside className="explorer-sidebar">
              <div className="sidebar-heading"><img src="/icons/folder.svg" width={16} height={16} alt="" /> Catalog</div>
              <button type="button" className="tree-item" aria-current={screen.name === 'releases' && !artistSlug && filter === 'all' ? 'page' : undefined} onClick={() => { setScreen({ name: 'releases' }); setArtistSlug(''); setFilter('all'); }}>
                All releases <span className="tree-count">{workspace.releases.length}</span>
              </button>
              <button type="button" className="tree-item" aria-current={screen.name === 'releases' && filter === 'draft' ? 'page' : undefined} onClick={() => { setScreen({ name: 'releases' }); setFilter('draft'); }}>
                Drafts <span className="tree-count">{drafts}</span>
              </button>
              <button type="button" className="tree-item" aria-current={screen.name === 'releases' && filter === 'published' ? 'page' : undefined} onClick={() => { setScreen({ name: 'releases' }); setFilter('published'); }}>
                Published <span className="tree-count">{published}</span>
              </button>
              <div className="sidebar-label">Artists</div>
              {workspace.artists.map((artist) => (
                <button
                  key={artist.slug}
                  type="button"
                  className="tree-item artist-tree"
                  aria-current={screen.name === 'releases' && artistSlug === artist.slug ? 'page' : undefined}
                  onClick={() => { setScreen({ name: 'releases' }); setArtistSlug(artist.slug); setFilter('all'); }}
                >
                  <span className="tree-marker">└</span>
                  <span>{artist.name}</span>
                </button>
              ))}
              <div className="sidebar-bottom">
                <strong>Owner</strong>
                Signed in
              </div>
            </aside>
            <main id="admin-main">
              {screen.name === 'releases' ? (
                <ReleaseLibrary
                  releases={workspace.releases}
                  tracks={workspace.tracks}
                  artists={workspace.artists}
                  filter={filter}
                  artistSlug={artistSlug}
                  search={search}
                  selected={selected}
                  onFilter={setFilter}
                  onSelect={setSelected}
                  onOpen={(next) => setScreen({ name: 'release', slug: next, type: 'single' })}
                  onDelete={(slug) => {
                    void api(`/api/admin/releases/${slug}`, { method: 'DELETE' })
                      .then(async () => {
                        setSelected('');
                        await refresh();
                        setNotice('Release deleted.');
                      })
                      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : 'Could not delete the release'));
                  }}
                />
              ) : null}
              {screen.name === 'release' ? (
                <ReleaseEditor
                  key={screen.slug ?? screen.type}
                  workspace={workspace}
                  slug={screen.slug}
                  initialType={screen.type}
                  onBack={() => setScreen({ name: 'releases' })}
                  onSaved={refresh}
                  notify={setNotice}
                />
              ) : null}
              {screen.name === 'artists' ? (
                <ArtistDirectory
                  workspace={workspace}
                  onOpen={(next) => setScreen({ name: 'artist', slug: next })}
                  onDelete={(slug) => {
                    void api(`/api/admin/artists/${slug}`, { method: 'DELETE' })
                      .then(async () => {
                        await refresh();
                        setNotice('Artist deleted.');
                      })
                      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : 'Could not delete the artist'));
                  }}
                />
              ) : null}
              {screen.name === 'artist' ? (
                <ArtistEditor
                  key={screen.slug ?? 'new'}
                  workspace={workspace}
                  slug={screen.slug}
                  onBack={() => setScreen({ name: 'artists' })}
                  onSaved={refresh}
                  onDelete={async (slug) => {
                    await api(`/api/admin/artists/${slug}`, { method: 'DELETE' });
                    await refresh();
                    setNotice('Artist deleted.');
                    setScreen({ name: 'artists' });
                  }}
                  notify={setNotice}
                />
              ) : null}
              {screen.name === 'statistics' ? <Statistics workspace={workspace} /> : null}
            </main>
          </div>
          <footer className="statusbar admin-statusbar">
            <span>{workspace.releases.length} releases · {workspace.tracks.length} tracks</span>
            <span className="owner-status"><i /> Owner</span>
          </footer>
        </section>
      </div>
      <div className="taskbar">
        <button type="button" className="start-button" aria-expanded={startOpen} onClick={() => setStartOpen((open) => !open)}>
          <img src="/icons/start.svg" alt="" width={19} height={16} />
          <strong>Start</strong>
        </button>
        <nav className="start-menu" hidden={!startOpen} aria-label="Start menu">
          <div className="start-strip"><strong>Auralithic</strong> 95 FM</div>
          <div className="start-items">
            <a href="/" onClick={() => setStartOpen(false)}><img src="/icons/radio.svg" width={23} height={23} alt="" />Auralithic 95 FM</a>
            <button type="button" onClick={() => { setStartOpen(false); void logout(); }}>Sign out</button>
          </div>
        </nav>
        <button type="button" className="task-button" hidden={false} aria-pressed={!hidden} onClick={() => setHidden((value) => !value)}>
          <img src="/icons/folder.svg" width={17} height={17} alt="" />
          <span>Catalog Manager</span>
        </button>
        <div className="task-tray">
          <time className="tray-clock" dateTime={clock.dateTime}>{clock.label}</time>
        </div>
      </div>
      <Notice message={notice} />
    </>
  );
};
