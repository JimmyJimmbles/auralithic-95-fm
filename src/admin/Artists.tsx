import { useState } from 'react';
import { api, upload } from './api.ts';
import { creditedSlugs, firstImage, nextChannel, slugify, uniqueSlug } from './format.ts';
import type { Workspace } from './types.ts';
import { mediaUrl } from './types.ts';

type LinkRow = { label: string; url: string };

export const ArtistEditor = ({
  workspace,
  slug,
  onBack,
  onSaved,
  onDelete,
  notify,
}: {
  workspace: Workspace;
  slug: string | null;
  onBack: () => void;
  onSaved: () => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
  notify: (message: string) => void;
}) => {
  const existing = workspace.artists.find((artist) => artist.slug === slug);
  const [name, setName] = useState(existing?.name ?? '');
  const [artistSlug, setArtistSlug] = useState(existing?.slug ?? '');
  const [channel, setChannel] = useState(existing?.channel ?? nextChannel(workspace.artists.map((artist) => artist.channel)));
  const [style, setStyle] = useState(existing?.style ?? '');
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [links, setLinks] = useState<LinkRow[]>(existing?.links.map((link) => ({ label: link.label, url: link.url })) ?? []);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [preview, setPreview] = useState(existing?.portraitKey ? mediaUrl(existing.portraitKey) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setPending(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        channel,
        style: style.trim(),
        bio: bio.trim(),
        links: links.filter((link) => link.label.trim() && link.url.trim()).map((link) => ({
          label: link.label.trim(),
          url: link.url.trim(),
        })),
      };
      const savedSlug = existing?.slug ?? uniqueSlug(artistSlug || name, new Set(workspace.artists.map((artist) => artist.slug)));
      if (!slugify(savedSlug)) throw new Error('Station address needs lowercase letters, numbers, or hyphens');
      if (existing) {
        await api(`/api/admin/artists/${existing.slug}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/api/admin/artists', { method: 'POST', body: JSON.stringify({ ...body, slug: savedSlug }) });
      }
      if (portrait) await upload(`/api/admin/artists/${existing?.slug ?? savedSlug}/portrait`, portrait);
      await onSaved();
      notify('Artist saved.');
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the artist');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="editor artist-editor">
      <div className="editor-breadcrumb">
        <button type="button" className="text-button" onClick={onBack}>Artists</button>
        <span>›</span>
        <span>Artist profile</span>
      </div>
      <div className="editor-heading">
        <h1>{name || 'New artist'}</h1>
        <span className="muted">CH {channel}</span>
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
              setPortrait(file);
              setPreview(URL.createObjectURL(file));
            }}
          >
            {preview ? <img src={preview} alt="" /> : <div className="cover-placeholder"><span>♟</span>Artist portrait</div>}
          </div>
          <label className="win-button">
            Choose portrait…
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPortrait(file);
                setPreview(file ? URL.createObjectURL(file) : (existing?.portraitKey ? mediaUrl(existing.portraitKey) : ''));
              }}
            />
          </label>
        </div>
        <div className="form-grid">
          <label className="form-field">
            Artist name
            <input value={name} maxLength={120} onChange={(event) => {
              setName(event.target.value);
              if (!existing) setArtistSlug(slugify(event.target.value));
            }} />
          </label>
          <label className="form-field">
            Artist station
            <input value={artistSlug} readOnly={Boolean(existing)} onChange={(event) => setArtistSlug(slugify(event.target.value))} />
          </label>
          <label className="form-field">
            Channel
            <input value={channel} maxLength={2} onChange={(event) => setChannel(event.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="form-field">
            Genre
            <input value={style} maxLength={160} onChange={(event) => setStyle(event.target.value)} />
          </label>
          <label className="form-field full">
            Bio
            <textarea value={bio} maxLength={4000} onChange={(event) => setBio(event.target.value)} />
          </label>
        </div>
      </div>
      <fieldset>
        <legend>Listen elsewhere</legend>
        {links.map((link, index) => (
          <div className="link-row" key={index}>
            <input value={link.label} placeholder="Label" onChange={(event) => {
              const value = event.target.value;
              setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: value } : item));
            }} />
            <input value={link.url} placeholder="https://" onChange={(event) => {
              const value = event.target.value;
              setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: value } : item));
            }} />
            <button type="button" className="win-button" onClick={() => setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>
        ))}
        <button type="button" className="text-button" onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}>Add a link</button>
      </fieldset>
      {error ? <p className="login-error">{error}</p> : null}
      <div className="editor-actions">
        <small>The station address stays put after the artist is created. Links must be https.</small>
        <button
          type="button"
          className="win-button primary-button"
          disabled={pending || !name.trim() || !style.trim() || !bio.trim() || channel.length !== 2}
          onClick={() => void save()}
        >
          Save artist
        </button>
        {existing ? (
          <button
            type="button"
            className="win-button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete ${existing.name} and every release on this station?`)) return;
              void onDelete(existing.slug).catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'Could not delete the artist');
              });
            }}
          >
            Delete artist
          </button>
        ) : null}
      </div>
    </div>
  );
};

export const ArtistDirectory = ({
  workspace,
  onOpen,
  onDelete,
}: {
  workspace: Workspace;
  onOpen: (slug: string) => void;
  onDelete: (slug: string) => void;
}) => (
  <>
    <header className="library-heading">
      <img src="/icons/folder.svg" alt="" />
      <div>
        <h1>The collective</h1>
        <p>Profiles, portraits, and the places to find your artists.</p>
      </div>
      <div className="heading-count"><strong>{workspace.artists.length}</strong>artists</div>
    </header>
    <section className="library-panel">
      <div className="table-scroll">
        {workspace.artists.length === 0 ? (
          <div className="empty-folder">
            <img src="/icons/folder.svg" alt="" />
            <strong>No artists yet.</strong>
            <p>Create the first artist, then attach their singles and albums.</p>
          </div>
        ) : (
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Artist station</th>
                <th>Releases</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workspace.artists.map((artist) => (
                <tr key={artist.slug} onClick={() => onOpen(artist.slug)}>
                  <td>
                    <span className="release-cell">
                      {artist.portraitKey ? <img src={mediaUrl(artist.portraitKey)} alt="" /> : <img src="/icons/folder.svg" alt="" />}
                      <span>
                        <strong>{artist.name}</strong>
                        <small>{artist.style}</small>
                      </span>
                    </span>
                  </td>
                  <td>{artist.slug}.auralithic.fm</td>
                  <td>{workspace.releases.filter((release) => creditedSlugs(release).includes(artist.slug)).length}</td>
                  <td>
                    <button
                      type="button"
                      className="win-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!window.confirm(`Delete ${artist.name}? Releases only on this station are removed. Shared releases stay with the other artists.`)) return;
                        onDelete(artist.slug);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  </>
);
