import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { uploadVideoFile } from "@/lib/browser-media-upload";
import { snippetVideoFilename, type Snippet } from "@/lib/snippets";

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

type UploadingMedia = {
  id: string;
  name: string;
  progress: number;
  error?: string;
};

function draftFromSnippet(snippet: Snippet): Draft {
  const mediaLen = Math.max(
    snippet.untagged_media.length,
    snippet.tagged_media.length
  );
  const media = Array.from({ length: mediaLen }, (_, index) => ({
    id: `${snippet.createdAt}-${index}-${snippet.title}`,
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

function nextMediaIndex(media: MediaDraft[]): number {
  return media.length + 1;
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
  const [discordBanner, setDiscordBanner] = useState(false);
  const [editingMediaId, setEditingMediaId] = useState<string | null>(null);
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [swapMediaId, setSwapMediaId] = useState<string | null>(null);
  const [mobileEditorVisible, setMobileEditorVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<UploadingMedia[]>([]);
  const deferredQuery = useDeferredValue(query);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const sync = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) {
        setMobileEditorVisible(false);
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
    setSwapMediaId(null);
    setUploadingMedia([]);
    setDiscordBanner(false);
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
      setSwapMediaId(null);
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
      setMobileEditorVisible(false);
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

  const swapMedia = (firstId: string, secondId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.media];
      const firstIndex = next.findIndex((item) => item.id === firstId);
      const secondIndex = next.findIndex((item) => item.id === secondId);
      if (firstIndex < 0 || secondIndex < 0) return current;
      [next[firstIndex], next[secondIndex]] = [next[secondIndex], next[firstIndex]];
      return { ...current, media: next };
    });
  };

  const onMobileSwapSelect = (id: string) => {
    if (!swapMediaId || swapMediaId === id) {
      setSwapMediaId((current) => (current === id ? null : id));
      return;
    }
    swapMedia(swapMediaId, id);
    setSwapMediaId(null);
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
    setSwapMediaId((current) => (current === id ? null : current));
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

  const uploadMediaFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!draft) return;
      setDiscordBanner(false);
      const files = Array.from(fileList);
      for (const file of files) {
        const mediaIndex = nextMediaIndex(draft.media) + uploadingMedia.length;
        const ext = file.name.split(".").pop()?.trim().toLowerCase() || "mp4";
        const desiredName = snippetVideoFilename(
          draft.title || "Untitled",
          mediaIndex,
          ext
        );
        const uploadId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${desiredName}-${Date.now()}`;
        setUploadingMedia((current) => [
          ...current,
          { id: uploadId, name: desiredName, progress: 0 },
        ]);
        const result = await uploadVideoFile(file, desiredName, (pct) => {
          setUploadingMedia((current) =>
            current.map((item) =>
              item.id === uploadId ? { ...item, progress: pct } : item
            )
          );
        });
        if (result.needsDiscordUpload) {
          setDiscordBanner(true);
        }
        if (result.downloadUrl) {
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
                    {
                      id,
                      untaggedUrl: result.downloadUrl ?? "",
                      taggedUrl: result.downloadUrl ?? "",
                    },
                  ],
                }
              : current
          );
        }
        setUploadingMedia((current) =>
          current.map((item) =>
            item.id === uploadId
              ? {
                  ...item,
                  progress: result.downloadUrl ? 100 : 0,
                  error: result.error,
                }
              : item
          )
        );
      }
    },
    [draft, uploadingMedia.length]
  );

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
      {discordBanner && (
        <div className="banner-error">
          <strong>Discord Upload Needed</strong> — a file was too large for
          fast-file. Upload directly via Discord if needed.
        </div>
      )}

      <div className="library-mobile-viewport">
        <div
          className={`library-grid${mobileEditorVisible ? " mobile-editor-active" : ""}`}
        >
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
                    onClick={() => {
                      setSelectedPath(record.path);
                      if (isMobile) {
                        setMobileEditorVisible(true);
                      }
                    }}
                  >
                    <div className="library-card-head">
                      <div>
                        <div className="library-card-title">
                          {renderTitle(record.snippet)}
                        </div>
                        <div className="subtle">Prod. {record.snippet.prod}</div>
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
                    <button
                      type="button"
                      className="library-mobile-back"
                      onClick={() => setMobileEditorVisible(false)}
                    >
                      ← Back
                    </button>
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
                  <div className="library-editor-actions">
                    <button type="button" className="btn btn-ghost" onClick={addMedia}>
                      Add URLs
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => mediaFileInputRef.current?.click()}
                    >
                      Upload video
                    </button>
                    <input
                      ref={mediaFileInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) void uploadMediaFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>

                {uploadingMedia.map((item) => (
                  <div key={item.id} className="file-row mono">
                    <span className="file-row-name">{item.name}</span>
                    {item.error ? (
                      <span style={{ color: "var(--danger)" }}>{item.error}</span>
                    ) : item.progress >= 100 ? (
                      <span style={{ color: "var(--success)" }}>Ready</span>
                    ) : (
                      <span>{item.progress}%</span>
                    )}
                    {!item.error && item.progress < 100 ? (
                      <div className="progress-bar" style={{ flex: "1 1 100%" }}>
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                ))}

                <div className="library-media-grid library-media-cards">
                  {draft.media.map((media, index) => (
                    <div
                      key={media.id}
                      className={`library-video-card${
                        editingMediaId === media.id ? " active" : ""
                      }`}
                      draggable={!isMobile}
                      onDragStart={() => setDraggingMediaId(media.id)}
                      onDragOver={(e) => {
                        if (isMobile) return;
                        e.preventDefault();
                        if (draggingMediaId) {
                          moveMedia(draggingMediaId, media.id);
                        }
                      }}
                      onDragEnd={() => setDraggingMediaId(null)}
                      onDrop={() => setDraggingMediaId(null)}
                    >
                      <div className="library-video-preview">
                        {media.untaggedUrl ? (
                          <video
                            src={media.untaggedUrl}
                            controls
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <div className="library-video-placeholder">Add an untagged URL</div>
                        )}
                        <button
                          type="button"
                          className={`library-video-chip library-swap-chip${
                            swapMediaId === media.id ? " active" : ""
                          }`}
                          onClick={() => {
                            if (isMobile) {
                              onMobileSwapSelect(media.id);
                            }
                          }}
                        >
                          {index + 1}
                        </button>
                      </div>
                      <div className="library-video-actions">
                        <span className="library-drag-handle">
                          {isMobile ? "Tap two numbers to swap" : "Drag"}
                        </span>
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

                <p className="subtle" style={{ margin: "1rem 0 0" }}>
                  Uploading a file here fills both untagged and tagged URLs so the
                  order and replay logic stay intact. You can still edit either URL
                  directly before saving.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
