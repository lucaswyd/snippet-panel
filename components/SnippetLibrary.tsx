import React, { useDeferredValue, useEffect, useState } from "react";
import type { Snippet } from "@/lib/snippets";

type SnippetRecord = {
  path: string;
  snippet: Snippet;
};

type Draft = {
  title: string;
  titleConfirmed: boolean;
  feat: string;
  prod: string;
  prodConfirmed: boolean;
  date: string;
  released: boolean;
};

function draftFromSnippet(snippet: Snippet): Draft {
  return {
    title: snippet.title,
    titleConfirmed: snippet.titleConfirmed,
    feat: snippet.feat ?? "",
    prod: snippet.prod,
    prodConfirmed: snippet.prodConfirmed,
    date: snippet.date,
    released: snippet.released,
  };
}

function displayTitle(snippet: Snippet): string {
  const title = `${snippet.title}${snippet.titleConfirmed ? "" : "*"}`;
  const feat = snippet.feat?.trim();
  if (!feat) return title;
  return `${title} (feat. ${feat})`;
}

export default function SnippetLibrary() {
  const [records, setRecords] = useState<SnippetRecord[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [selectedPath, selectedRecord]);

  const filtered = records.filter((record) => {
    const haystack = [
      record.snippet.title,
      record.snippet.feat ?? "",
      record.snippet.prod,
      record.snippet.date,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(deferredQuery.trim().toLowerCase());
  });

  const onSave = async () => {
    if (!selectedRecord || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/snippets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: selectedRecord.path,
          ...draft,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save snippet");
    } finally {
      setSaving(false);
    }
  };

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
        <div className="library-toolbar-note">
          {filtered.length} snippet{filtered.length === 1 ? "" : "s"}
        </div>
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
                        <span>{displayTitle(record.snippet)}</span>
                      </div>
                      <div className="subtle">{record.snippet.prod}</div>
                    </div>
                    <span
                      className={`badge library-status-badge ${
                        record.snippet.released ? "badge-done" : "badge-pending"
                      }`}
                    >
                      {record.snippet.released ? "Released" : "Unreleased"}
                    </span>
                  </div>
                  <div className="library-card-meta">
                    <span>{record.snippet.date}</span>
                    <span>{record.snippet.untagged_media.length} snippets</span>
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
                  <h3>{selectedRecord.snippet.title}</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
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

              <div className="library-media-grid">
                <div className="library-media-panel">
                  <h4>Untagged media</h4>
                  <div className="library-links">
                    {selectedRecord.snippet.untagged_media.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="library-media-panel">
                  <h4>Tagged media</h4>
                  <div className="library-links">
                    {selectedRecord.snippet.tagged_media.length > 0 ? (
                      selectedRecord.snippet.tagged_media.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      ))
                    ) : (
                      <p className="subtle">No tagged media yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
