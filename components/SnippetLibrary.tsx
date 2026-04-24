import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Snippet } from "@/lib/snippets";

type SnippetRecord = {
  path: string;
  snippet: Snippet;
};

type MediaDraft = {
  id: string;
  untaggedUrl: string;
  taggedUrl: string;
};

type Draft = {
  title: string;
  titleConfirmed: boolean;
  feat: string;
  prod: string;
  prodConfirmed: boolean;
  date: string;
  released: boolean;
  media: MediaDraft[];
};

function draftFromSnippet(snippet: Snippet): Draft {
  const mediaLen = Math.max(
    snippet.untagged_media.length,
    snippet.tagged_media.length
  );
  const media = Array.from({ length: mediaLen }, (_, index) => ({
    id: `${snippet.createdAt}-${index}`,
    untaggedUrl: snippet.untagged_media[index] ?? "",
    taggedUrl: snippet.tagged_media[index] ?? "",
  }));

  return {
    title: snippet.title,
    titleConfirmed: snippet.titleConfirmed,
    feat: snippet.feat ?? "",
    prod: snippet.prod,
    prodConfirmed: snippet.prodConfirmed,
    date: snippet.date,
    released: snippet.released,
    media,
  };
}

function snippetCountLabel(count: number): string {
  return `${count} snippet${count === 1 ? "" : "s"}`;
}

function renderTitle(snippet: { title: string; titleConfirmed: boolean; feat?: string }) {
  const feat = snippet.feat?.trim();
  return (
    <>
      <span>
        {snippet.title}
        {snippet.titleConfirmed ? "" : "*"}
      </span>
      {feat ? <span className="library-title-feat"> (feat. {feat})</span> : null}
    </>
  );
}

export default function SnippetLibrary() {
  const [records, setRecords] = useState<SnippetRecord[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/snippets");
      const data = (await res.json()) as SnippetRecord[] | { error?: string };
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(
          !Array.isArray(data) && typeof data.error === "string"
            ? data.error
            : "Could not load snippets"
        );
      }
      setRecords(data);
      setSelectedPath((current) =>
        current && data.some((record) => record.path === current)
          ? current
          : (data[0]?.path ?? "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load snippets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedRecord = records.find((record) => record.path === selectedPath) ?? null;

  useEffect(() => {
    setDraft(selectedRecord ? draftFromSnippet(selectedRecord.snippet) : null);
    setEditingMediaId(null);
  }, [selectedPath, selectedRecord]);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        const haystack = [
          record.snippet.title,
          record.snippet.feat ?? "",
          record.snippet.prod,
          record.snippet.date,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(deferredQuery.trim().toLowerCase());
      }),
    [deferredQuery, records]
  );

  const saveDraft = async () => {
    if (!selectedRecord || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/snippets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedRecord.path,
          title: draft.title,
          titleConfirmed: draft.titleConfirmed,
          feat: draft.feat,
          prod: draft.prod,
          prodConfirmed: draft.prodConfirmed,
          date: draft.date,
          released: draft.released,
          media: draft.media,
        }),
      });
      const data = (await res.json()) as { error?: string; snippet?: Snippet };
      if (!res.ok || !data.snippet) {
        throw new Error(data.error || "Could not save snippet");
      }
      setRecords((current) =>
        current.map((record) =>
          record.path === selectedRecord.path
            ? { ...record, snippet: data.snippet as Snippet }
            : record
        )
      );
      setDraft(draftFromSnippet(data.snippet));
      setEditingMediaId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save snippet");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedRecord) return;
    if (!window.confirm(`Delete ${selectedRecord.snippet.title}?`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/snippets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedRecord.path }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not delete snippet");
      }
      setRecords((current) => current.filter((record) => record.path !== selectedRecord.path));
      const remaining = filtered.filter((record) => record.path !== selectedRecord.path);
      setSelectedPath(remaining[0]?.path ?? "");
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete snippet");
    } finally {
      setDeleting(false);
    }
  };

  const updateMedia = (id: string, patch: Partial<MediaDraft>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            media: current.media.map((item) =>
              item.id === id ? { ...item, ...patch } : item
            ),
          }
        : current
    );
  };

  const removeMedia = (id: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            media: current.media.filter((item) => item.id !== id),
          }
        : current
    );
    setEditingMediaId((current) => (current === id ? null : current));
  };

  const addMedia = () => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `media-${Date.now()}`;
    setDraft((current) =>
      current
        ? {
            ...current,
            media: [
              ...current.media,
              { id, untaggedUrl: "", taggedUrl: "" },
            ],
          }
        : current
    );
    setEditingMediaId(id);
  };

  const moveMedia = (dragId: string, hoverId: string) => {
    if (dragId === hoverId) return;
    setDraft((current) => {
      if (!current) return current;
      const from = current.media.findIndex((item) => item.id === dragId);
      const to = current.media.findIndex((item) => item.id === hoverId);
      if (from < 0 || to < 0) return current;
      const next = [...current.media];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...current, media: next };
    });
  };

  const activeMedia = draft?.media.find((item) => item.id === editingMediaId) ?? null;

  return (
    <section className="snippet-library panel">
      <div className="library-hero">
        <div>
          <h2 className="library-title">Library</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="library-toolbar">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, feat, prod, date"
        />
        <div className="library-toolbar-note">{snippetCountLabel(filtered.length)}</div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      <div className="library-grid">
        <div className="library-list">
          {loading ? (
            <p className="subtle">Loading snippets…</p>
          ) : filtered.length === 0 ? (
            <p className="subtle">No snippets matched that search.</p>
          ) : (
            filtered.map((record, index) => {
              const active = record.path === selectedPath;
              return (
                <button
                  key={record.path}
                  type="button"
                  className={`library-card${active ? " active" : ""}`}
                  style={{ animationDelay: `${index * 30}ms` }}
                  onClick={() => setSelectedPath(record.path)}
                >
                  <div className="library-card-head">
                    <div>
                      <div className="library-card-title">
                        {renderTitle(record.snippet)}
                      </div>
                      <div className="subtle">{record.snippet.prod}</div>
                    </div>
                    <span
                      className={`badge library-status-badge ${
                        record.snippet.released ? "badge-done" : "badge-posting"
                      }`}
                    >
                      {record.snippet.released ? "Released" : "Unreleased"}
                    </span>
                  </div>
                  <div className="library-card-meta">
                    <span>{record.snippet.date}</span>
                    <span>{snippetCountLabel(record.snippet.untagged_media.length)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="library-editor">
          {!selectedRecord || !draft ? (
            <div className="library-empty">
              <p className="subtle">Pick a snippet to edit its info and synced Discord copy.</p>
            </div>
          ) : (
            <>
              <div className="library-editor-head">
                <div>
                  <p className="library-kicker">editing</p>
                  <h3>{renderTitle(draft)}</h3>
                </div>
                <div className="library-editor-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={deleting || saving}
                    onClick={() => void deleteSelected()}
                  >
                    {deleting ? "Deleting…" : "Delete snippet"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving || deleting}
                    onClick={() => void saveDraft()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>

              <div className="library-form-grid">
                <div>
                  <label className="field-label">Title</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((current) =>
                        current ? { ...current, title: e.target.value } : current
                      )
                    }
                  />
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={draft.titleConfirmed}
                    onChange={(e) =>
                      setDraft((current) =>
                        current
                          ? { ...current, titleConfirmed: e.target.checked }
                          : current
                      )
                    }
                  />
                  Title confirmed
                </label>
                <div>
                  <label className="field-label">Feat</label>
                  <input
                    type="text"
                    value={draft.feat}
                    onChange={(e) =>
                      setDraft((current) =>
                        current ? { ...current, feat: e.target.value } : current
                      )
                    }
                  />
                </div>
                <div>
                  <label className="field-label">Producer</label>
                  <input
                    type="text"
                    value={draft.prod}
                    onChange={(e) =>
                      setDraft((current) =>
                        current ? { ...current, prod: e.target.value } : current
                      )
                    }
                  />
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={draft.prodConfirmed}
                    onChange={(e) =>
                      setDraft((current) =>
                        current
                          ? { ...current, prodConfirmed: e.target.checked }
                          : current
                      )
                    }
                  />
                  Producer confirmed
                </label>
                <div>
                  <label className="field-label">First Previewed</label>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) =>
                      setDraft((current) =>
                        current ? { ...current, date: e.target.value } : current
                      )
                    }
                  />
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={draft.released}
                    onChange={(e) =>
                      setDraft((current) =>
                        current
                          ? { ...current, released: e.target.checked }
                          : current
                      )
                    }
                  />
                  Released
                </label>
              </div>

              <div className="library-media-header">
                <div>
                  <h4 className="library-media-title">Media</h4>
                </div>
                <button type="button" className="btn btn-ghost" onClick={addMedia}>
                  Add media
                </button>
              </div>

              <div className="library-media-grid library-media-cards">
                {draft.media.map((media, index) => (
                  <div
                    key={media.id}
                    className={`library-video-card${
                      editingMediaId === media.id ? " active" : ""
                    }`}
                    draggable
                    onDragStart={() => setDraggingMediaId(media.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggingMediaId) {
                        moveMedia(draggingMediaId, media.id);
                      }
                    }}
                    onDragEnd={() => setDraggingMediaId(null)}
                    onDrop={() => setDraggingMediaId(null)}
                  >
                    <button
                      type="button"
                      className="library-video-preview"
                      onClick={() => setPreviewUrl(media.untaggedUrl)}
                    >
                      {media.untaggedUrl ? (
                        <video
                          src={media.untaggedUrl}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <div className="library-video-placeholder">Add an untagged URL</div>
                      )}
                      <span className="library-video-chip">#{index + 1}</span>
                    </button>
                    <div className="library-video-actions">
                      <span className="library-drag-handle">Drag</span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setEditingMediaId((current) =>
                            current === media.id ? null : media.id
                          )
                        }
                      >
                        Edit
                      </button>
                    </div>
                    {editingMediaId === media.id ? (
                      <div className="library-url-editor">
                        <label className="field-label">Untagged URL</label>
                        <input
                          type="text"
                          value={media.untaggedUrl}
                          onChange={(e) =>
                            updateMedia(media.id, { untaggedUrl: e.target.value })
                          }
                        />
                        <label className="field-label">Tagged URL</label>
                        <input
                          type="text"
                          value={media.taggedUrl}
                          onChange={(e) =>
                            updateMedia(media.id, { taggedUrl: e.target.value })
                          }
                        />
                        <div className="library-url-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => removeMedia(media.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {!draft.media.length ? (
                <p className="subtle" style={{ marginTop: "1rem" }}>
                  Add at least one media pair to keep the snippet live in Discord.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {previewUrl ? (
        <div className="modal-backdrop" onClick={() => setPreviewUrl(null)}>
          <div
            className="panel modal library-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row-between" style={{ marginBottom: "0.75rem" }}>
              <h2>Preview</h2>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "0.35rem 0.65rem" }}
                onClick={() => setPreviewUrl(null)}
              >
                Close
              </button>
            </div>
            <video
              src={previewUrl}
              className="library-preview-player"
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
