import { useState } from 'react';
import { api, upload } from './api.ts';
import { audioFiles, firstImage, readDuration, today, uniqueSlug } from './format.ts';
import { requestCatalogRefresh } from '../hooks/useCatalog.tsx';
import type { AdminRelease, AdminTrack, Workspace } from './types.ts';
import { mediaUrl } from './types.ts';

type Row = {
  key: string;
  id: string;
  title: string;
  durationSeconds: number;
  file: File | null;
  persisted: boolean;
  audioKey: string | null;
};

const rowsFrom = (tracks: AdminTrack[]): Row[] => tracks
  .slice()
  .sort((left, right) => left.position - right.position)
  .map((track) => ({
    key: track.id,
    id: track.id,
    title: track.title,
    durationSeconds: track.durationSeconds,
    file: null,
    persisted: true,
    audioKey: track.audioKey,
  }));

export const ReleaseEditor = ({
  workspace,
  slug,
  initialType,
  onBack,
  onSaved,
  notify,
}: {
  workspace: Workspace;
  slug: string | null;
  initialType: 'single' | 'album';
  onBack: () => void;
  onSaved: () => Promise<void>;
  notify: (message: string) => void;
}) => {
  const existing = workspace.releases.find((release) => release.slug === slug);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [artistSlugs, setArtistSlugs] = useState<string[]>(() => {
    if (existing?.artistSlugs && existing.artistSlugs.length > 0) return [...existing.artistSlugs];
    if (existing?.artistSlug) return [existing.artistSlug];
    const first = workspace.artists[0]?.slug;
    return first ? [first] : [];
  });
  const [type, setType] = useState<'single' | 'album'>(existing?.type ?? initialType);
  const [releaseDate, setReleaseDate] = useState(existing?.releaseDate ?? today());
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState(existing?.coverKey ? mediaUrl(existing.coverKey) : '');
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(workspace.tracks.filter((track) => track.releaseSlug === slug)));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const published = existing?.status === 'published';
  const gaps: string[] = [];
  if (!title.trim()) gaps.push('a title');
  if (artistSlugs.length === 0) gaps.push('an artist');
  if (!releaseDate) gaps.push('a release date');
  if (!cover && !existing?.coverKey) gaps.push('cover art');
  if (rows.length === 0) gaps.push('a track');
  if (type === 'single' && rows.length > 1) gaps.push('exactly one track');
  for (const row of rows) {
    if (!row.title.trim()) gaps.push('a title on every track');
    if (!row.audioKey && !row.file) gaps.push(`an audio file for “${row.title.trim() || 'untitled track'}”`);
  }
  const readiness = gaps.length ? `Still needs ${gaps.join(', ')}.` : 'Ready to publish.';

  const setArtistAt = (index: number, value: string) => {
    setArtistSlugs((current) => {
      const next = [...current];
      const previous = next[index] ?? '';
      const other = next.findIndex((slug, item) => item !== index && slug === value);
      next[index] = value;
      if (other >= 0) next[other] = previous;
      return next;
    });
  };

  const addArtist = () => {
    const next = workspace.artists.find((artist) => !artistSlugs.includes(artist.slug));
    if (!next || artistSlugs.length >= 3) return;
    setArtistSlugs((current) => (current.length >= 3 ? current : [...current, next.slug]));
  };

  const removeArtist = (index: number) => {
    setArtistSlugs((current) => (current.length <= 1 ? current : current.filter((_, item) => item !== index)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= rows.length) return;
    setRows((current) => {
      const copy = [...current];
      const item = copy[index];
      const other = copy[next];
      if (!item || !other) return current;
      copy[index] = other;
      copy[next] = item;
      return copy;
    });
  };

  const addAudio = async (list: ArrayLike<File> | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const chosen = type === 'single' ? files.slice(0, 1) : files;
    if (chosen.length === 0) return;
    const prepared = await Promise.all(chosen.map(async (file) => ({
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      durationSeconds: await readDuration(file).catch(() => 0) || 1,
    })));
    setRows((current) => {
      if (type === 'single' && current.length > 0) {
        const next = prepared[0];
        if (!next) return current;
        return current.map((row, index) => (
          index === 0 ? { ...row, file: next.file, durationSeconds: next.durationSeconds || row.durationSeconds } : row
        ));
      }
      const taken = new Set([
        ...workspace.tracks.map((track) => track.id),
        ...current.map((row) => row.id),
      ]);
      const nextRows = prepared.map((item) => {
        const id = uniqueSlug(item.title, taken);
        taken.add(id);
        return {
          key: id,
          id,
          title: item.title,
          durationSeconds: item.durationSeconds,
          file: item.file,
          persisted: false,
          audioKey: null,
        };
      });
      return type === 'single' ? nextRows : [...current, ...nextRows];
    });
    setError('');
  };

  const save = async (publish: boolean) => {
    setPending(true);
    setError('');
    setStatus('Saving the release…');
    try {
      const taken = new Set(workspace.releases.map((release) => release.slug));
      let saved: AdminRelease;
      if (!existing) {
        saved = await api<AdminRelease>('/api/admin/releases', {
          method: 'POST',
          body: JSON.stringify({
            slug: uniqueSlug(title, taken),
            artistSlugs,
            title: title.trim(),
            type,
            releaseDate,
          }),
        });
      } else {
        saved = await api<AdminRelease>(`/api/admin/releases/${existing.slug}`, {
          method: 'PATCH',
          body: JSON.stringify({ artistSlugs, title: title.trim(), type, releaseDate }),
        });
      }
      if (cover) {
        setStatus('Uploading artwork…');
        await upload(`/api/admin/releases/${saved.slug}/cover`, cover);
      }
      for (const row of rows) {
        if (!row.persisted) {
          await api('/api/admin/tracks', {
            method: 'POST',
            body: JSON.stringify({
              id: row.id,
              releaseSlug: saved.slug,
              title: row.title.trim(),
              durationSeconds: row.durationSeconds,
            }),
          });
        } else {
          await api(`/api/admin/tracks/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title: row.title.trim(), durationSeconds: row.durationSeconds }),
          });
        }
        if (row.file) {
          setStatus(row.file.type === 'audio/mpeg' || row.file.name.toLowerCase().endsWith('.mp3')
            ? `Uploading “${row.title.trim() || 'track'}”…`
            : `Encoding “${row.title.trim() || 'track'}”…`);
          await upload(`/api/admin/tracks/${row.id}/audio`, row.file);
        }
      }
      if (rows.length > 1) {
        await api(`/api/admin/tracks/reorder`, {
          method: 'POST',
          body: JSON.stringify({ releaseSlug: saved.slug, trackIds: rows.map((row) => row.id) }),
        });
      }
      if (publish) {
        setStatus('Putting it on the radio…');
        await api(`/api/admin/releases/${saved.slug}/publish`, { method: 'POST', body: '{}' });
        requestCatalogRefresh();
      }
      await onSaved();
      notify(publish ? 'Published.' : 'Saved.');
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setPending(false);
      setStatus('');
    }
  };

  const unpublish = async () => {
    if (!existing) return;
    setPending(true);
    setError('');
    try {
      await api(`/api/admin/releases/${existing.slug}/unpublish`, { method: 'POST', body: '{}' });
      await onSaved();
      notify('Taken off air.');
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unpublish');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="editor">
      <div className="editor-breadcrumb">
        <button type="button" className="text-button" onClick={onBack}>Releases</button>
        <span>›</span>
        <span>{existing ? 'Edit release' : type === 'album' ? 'New album' : 'New single'}</span>
      </div>
      <div className="release-information">
        <div className="cover-picker">
          <div
            className="cover-frame"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = firstImage(event.dataTransfer.files);
              if (!file) return;
              setCover(file);
              setCoverPreview(URL.createObjectURL(file));
            }}
          >
            {coverPreview ? <img src={coverPreview} alt="" /> : <div className="cover-placeholder"><span>▧</span>Cover artwork</div>}
          </div>
          <label className="win-button">
            {coverPreview ? 'Change artwork…' : 'Add artwork…'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setCover(file);
                setCoverPreview(file ? URL.createObjectURL(file) : (existing?.coverKey ? mediaUrl(existing.coverKey) : ''));
              }}
            />
          </label>
          <small>JPG, PNG or WebP · up to 20 MB</small>
        </div>
        <div className="form-grid">
          <label className="form-field">
            Release title
            <input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="form-field">
            Release type
            <select value={type} onChange={(event) => setType(event.target.value === 'album' ? 'album' : 'single')}>
              <option value="single">Single</option>
              <option value="album">Album</option>
            </select>
          </label>
          <label className="form-field">
            Release date
            <input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} />
          </label>
          <div className="form-field full">
            <span id="release-artists-label">Artists</span>
            <div className="artist-picks" role="group" aria-labelledby="release-artists-label">
              {artistSlugs.length === 0 ? <select defaultValue="" aria-label="Artist"><option value="">Add an artist first</option></select> : null}
              {artistSlugs.map((value, index) => {
                const artist = workspace.artists.find((item) => item.slug === value);
                return (
                  <span className="artist-pick" key={index}>
                    <select aria-label={index === 0 ? 'Lead artist' : `Artist ${index + 1}`} value={value} onChange={(event) => setArtistAt(index, event.target.value)}>
                      {workspace.artists.map((option) => <option key={option.slug} value={option.slug}>{option.name}</option>)}
                    </select>
                    {index > 0 ? (
                      <button type="button" className="tiny-button" aria-label={`Remove ${artist?.name ?? 'artist'}`} onClick={() => removeArtist(index)}>×</button>
                    ) : artistSlugs.length > 1 ? <span className="artist-pick-spacer" aria-hidden="true" /> : null}
                  </span>
                );
              })}
            </div>
            {artistSlugs.length < 3 && workspace.artists.length > artistSlugs.length ? (
              <button type="button" className="win-button artist-add" onClick={addArtist}>Add artist</button>
            ) : null}
            <small>The first artist leads the collective rotation. Up to three, and the release shows in each catalog.</small>
          </div>
        </div>
      </div>
      <section>
        <div
          className="editor-track-list"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addAudio(audioFiles(event.dataTransfer.files));
          }}
        >
          {rows.length === 0 ? (
            <div
              className="import-drop"
              onDragOver={(event) => {
                event.preventDefault();
                event.currentTarget.classList.add('dragover');
              }}
              onDragLeave={(event) => event.currentTarget.classList.remove('dragover')}
              onDrop={(event) => event.currentTarget.classList.remove('dragover')}
            >
              <strong>{type === 'album' ? 'Every album starts with a first track.' : 'Your next single goes here.'}</strong>
              <p>{type === 'album' ? 'Select one song or several at once. MP3, WAV, or FLAC. Up to 90 MB each.' : 'Choose an audio file. MP3, WAV, or FLAC. Up to 90 MB.'}</p>
              <label className="win-button">
                {type === 'album' ? 'Choose songs…' : 'Choose audio…'}
                <input type="file" accept="audio/*,.mp3,.wav,.flac,.m4a" multiple={type === 'album'} hidden onChange={(event) => void addAudio(event.target.files)} />
              </label>
            </div>
          ) : rows.map((row, index) => (
            <div className="editor-track" key={row.key}>
              <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="track-note" aria-hidden="true">♪</span>
              <label className="track-editor-info">
                <input aria-label={`Title for track ${index + 1}`} value={row.title} onChange={(event) => {
                  const value = event.target.value;
                  setRows((current) => current.map((item) => item.key === row.key ? { ...item, title: value } : item));
                }} />
              </label>
              <span className="track-file">{row.file ? row.file.name : row.audioKey ? 'Audio ready' : 'No audio yet'}</span>
              <div className="track-actions">
                <label className="win-button">
                  {row.audioKey || row.file ? 'Replace' : 'Choose audio'}
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.flac,.m4a"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) return;
                      void readDuration(file).then((durationSeconds) => {
                        setRows((current) => current.map((item) => item.key === row.key ? { ...item, file, durationSeconds } : item));
                      }).catch(() => {
                        setRows((current) => current.map((item) => item.key === row.key ? { ...item, file } : item));
                      });
                    }}
                  />
                </label>
                <button type="button" className="tiny-button" disabled={index === 0} aria-label="Move up" onClick={() => move(index, -1)}>↑</button>
                <button type="button" className="tiny-button" disabled={index === rows.length - 1} aria-label="Move down" onClick={() => move(index, 1)}>↓</button>
                <button
                  type="button"
                  className="tiny-button"
                  aria-label="Delete track"
                  onClick={() => {
                    if (!row.persisted) {
                      setRows((current) => current.filter((item) => item.key !== row.key));
                      return;
                    }
                    if (!window.confirm(`Delete “${row.title || 'this track'}”?`)) return;
                    void api(`/api/admin/tracks/${row.id}`, { method: 'DELETE' })
                      .then(() => setRows((current) => current.filter((item) => item.key !== row.key)))
                      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not delete the track'));
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        {type === 'album' && rows.length > 0 ? (
          <label className="win-button section-add">
            Add songs…
            <input type="file" accept="audio/*,.mp3,.wav,.flac,.m4a" multiple hidden onChange={(event) => void addAudio(event.target.files)} />
          </label>
        ) : null}
      </section>
      <div className="release-readiness" aria-live="polite">
        {pending ? status : error || readiness}
      </div>
      <div className="editor-actions">
        <small>{published ? 'This release is on the radio.' : 'Save draft keeps it off the radio. Publish puts it on air.'}</small>
        <button type="button" className="win-button" disabled={pending || !title.trim() || artistSlugs.length === 0 || !releaseDate} onClick={() => void save(false)}>Save draft</button>
        <button
          type="button"
          className="win-button primary-button"
          disabled={pending}
          onClick={() => {
            if (gaps.length > 0) {
              setError(readiness);
              return;
            }
            void save(true);
          }}
        >
          {published ? 'Update on air' : 'Publish'}
        </button>
        {published ? <button type="button" className="win-button" disabled={pending} onClick={() => void unpublish()}>Take off air</button> : null}
      </div>
    </div>
  );
};
