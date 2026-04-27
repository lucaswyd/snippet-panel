import React, { useCallback, useRef, useState } from "react";
import { uploadVideoFile } from "@/lib/browser-media-upload";
import { snippetVideoFilename } from "@/lib/snippets";

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type UploadRow = {
  id: string;
  name: string;
  size: number;
  progress: number;
  downloadUrl?: string;
  error?: string;
};

export default function SnippetForm() {
  const [title, setTitle] = useState("");
  const [titleConfirmed, setTitleConfirmed] = useState(true);
  const [feat, setFeat] = useState("");
  const [prod, setProd] = useState("");
  const [prodConfirmed, setProdConfirmed] = useState(true);
  const [date, setDate] = useState(todayISODate());
  const [released, setReleased] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [pingNewSnippet, setPingNewSnippet] = useState(false);
  const [mediaMode, setMediaMode] = useState<"files" | "urls">("files");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [urlText, setUrlText] = useState("");
  const [discordBanner, setDiscordBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const uploadIndexRef = useRef(1);

  const uploadOne = useCallback((file: File, uploadIndex: number) => {
    const originalExt = file.name.split(".").pop()?.trim().toLowerCase() || "mp4";
    const desiredName = snippetVideoFilename(
      title || "Untitled",
      uploadIndex,
      originalExt
    );
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${desiredName}-${Date.now()}`;
    setUploads((u) => [
      ...u,
      { id, name: desiredName, size: file.size, progress: 0 },
    ]);

    const patchRow = (patch: Partial<UploadRow>) => {
      setUploads((u) =>
        u.map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
    };

    void uploadVideoFile(file, desiredName, (pct) => patchRow({ progress: pct })).then(
      (result) => {
        if (result.needsDiscordUpload) {
          setDiscordBanner(true);
        }
        patchRow({
          progress: result.downloadUrl ? 100 : 0,
          downloadUrl: result.downloadUrl,
          error: result.error,
        });
      }
    );
  }, [title]);

  const onFiles = useCallback(
    (fileList: FileList | File[]) => {
      setDiscordBanner(false);
      for (const file of Array.from(fileList)) {
        const uploadIndex = uploadIndexRef.current;
        uploadIndexRef.current += 1;
        uploadOne(file, uploadIndex);
      }
    },
    [uploadOne]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag");
    if (e.dataTransfer.files?.length) void onFiles(e.dataTransfer.files);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const urls =
      mediaMode === "files"
        ? uploads
            .map((u) => u.downloadUrl)
            .filter((x): x is string => Boolean(x))
        : urlText
            .split(/\r?\n|,/)
            .map((url) => url.trim())
            .filter(Boolean);

    console.log("=== DEBUG: SnippetForm submit ===");
    console.log("Media mode:", mediaMode);
    console.log("Uploads:", uploads);
    console.log("URL text:", urlText);
    console.log("Final URLs array:", urls);
    console.log("=== END DEBUG ===");
    if (!title.trim() || !prod.trim()) {
      setSubmitError("Title and producer are required.");
      return;
    }
    if (urls.length === 0) {
      setSubmitError(
        mediaMode === "files"
          ? "Upload at least one video."
          : "Enter at least one media URL."
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          titleConfirmed,
          feat: feat.trim() || undefined,
          prod: prod.trim(),
          prodConfirmed,
          date,
          released,
          isNew,
          pingNewSnippet,
          rawFileUrls: urls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || "Submit failed");
        return;
      }
      setTitle("");
      setFeat("");
      setProd("");
      setTitleConfirmed(true);
      setProdConfirmed(true);
      setDate(todayISODate());
      setReleased(false);
      setIsNew(false);
      setPingNewSnippet(false);
      setUploads([]);
      setUrlText("");
      setMediaMode("files");
      uploadIndexRef.current = 1;
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" style={{ padding: "1.75rem" }} onSubmit={onSubmit}>
      <h1>New snippet</h1>
      <p className="subtle" style={{ marginBottom: "1.5rem" }}>
        
      </p>

      {discordBanner && (
        <div className="banner-error">
          <strong>Discord Upload Needed</strong> — file is too large for
          fast-file. Upload directly via Discord.
        </div>
      )}
      {submitError && (
        <div className="banner-error" style={{ marginBottom: "1rem" }}>
          {submitError}
        </div>
      )}

      <div style={{ marginBottom: "1.1rem" }}>
        <div className="row-between" style={{ marginBottom: "0.35rem" }}>
          <label className="field-label">Title</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={titleConfirmed}
              onChange={(e) => setTitleConfirmed(e.target.checked)}
            />
            Confirmed?
          </label>
        </div>
        <input
          type="text"
          className="mono"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Song title"
          required
        />
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <label className="field-label">Feat (optional)</label>
        <input
          type="text"
          className="mono"
          value={feat}
          onChange={(e) => setFeat(e.target.value)}
          placeholder="Featured artists"
        />
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <div className="row-between" style={{ marginBottom: "0.35rem" }}>
          <label className="field-label">Producer</label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prodConfirmed}
              onChange={(e) => setProdConfirmed(e.target.checked)}
            />
            Confirmed?
          </label>
        </div>
        <input
          type="text"
          className="mono"
          value={prod}
          onChange={(e) => setProd(e.target.value)}
          placeholder="Producer"
          required
        />
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <label className="field-label">First previewed</label>
        <input
          type="date"
          className="mono"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <div className="switch-row">
          <span>Status</span>
          <label className="toggle" style={{ gap: "0.6rem" }}>
            <span style={{ opacity: released ? 0.4 : 1 }}>Unreleased</span>
            <input
              type="checkbox"
              checked={released}
              onChange={(e) => setReleased(e.target.checked)}
            />
            <span style={{ opacity: released ? 1 : 0.4 }}>Released</span>
          </label>
        </div>
      </div>

      <div style={{ marginBottom: "1.1rem" }}>
        <div className="switch-row">
          <span>New snippet?</span>
          <label className="slider-toggle" aria-label="New snippet">
            <input
              type="checkbox"
              checked={isNew}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsNew(checked);
                if (!checked) setPingNewSnippet(false);
              }}
            />
            <span className="slider-toggle-track" />
          </label>
        </div>
      </div>

      <div
        style={{
          marginBottom: "1.1rem",
          maxHeight: isNew ? 80 : 0,
          opacity: isNew ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 220ms ease, opacity 220ms ease",
        }}
      >
        <div className="switch-row">
          <span>Ping?</span>
          <label className="slider-toggle" aria-label="Ping new snippet role">
            <input
              type="checkbox"
              checked={pingNewSnippet}
              onChange={(e) => setPingNewSnippet(e.target.checked)}
            />
            <span className="slider-toggle-track" />
          </label>
        </div>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label className="field-label">Media</label>
        <div className="input-mode-toggle">
          <button
            type="button"
            className={`input-mode-pill${mediaMode === "files" ? " active" : ""}`}
            onClick={() => setMediaMode("files")}
          >
            Upload file
          </button>
          <button
            type="button"
            className={`input-mode-pill${mediaMode === "urls" ? " active" : ""}`}
            onClick={() => setMediaMode("urls")}
          >
            Paste URLs
          </button>
        </div>
        {mediaMode === "files" ? (
          <>
            <div
              className="dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("drag");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
              onDrop={onDrop}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept="video/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => e.target.files && void onFiles(e.target.files)}
              />
              <span className="mono" style={{ color: "var(--text-muted)" }}>
                Drop videos or click to upload
              </span>
            </div>
            {uploads.map((u) => (
              <div key={u.id} className="file-row mono">
                <span className="file-row-name">
                  {u.name} — {(u.size / 1024 / 1024).toFixed(1)} MB
                </span>
                {u.error ? (
                  <span style={{ color: "var(--danger)" }}>{u.error}</span>
                ) : u.downloadUrl ? (
                  <span style={{ color: "var(--success)" }}>Ready</span>
                ) : (
                  <span>{u.progress}%</span>
                )}
                {!u.error && !u.downloadUrl && (
                  <div className="progress-bar" style={{ flex: "1 1 100%" }}>
                    <span style={{ width: `${u.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          <textarea
            className="mono"
            rows={6}
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder={"One media URL per line\nhttps://fast-file.com/example/download"}
          />
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting}
        style={{ width: "100%" }}
      >
        {submitting ? "Submitting…" : "Submit to queue"}
      </button>
    </form>
  );
}
