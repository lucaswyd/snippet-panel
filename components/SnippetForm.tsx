import React, { useCallback, useRef, useState } from "react";
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

/** Browser → fast-file directly (avoids Vercel ~4.5MB body limit on /api/upload). */
const FAST_FILE_UPLOAD = "https://fast-file.com/upload";
/** Only used if direct upload fails; must stay under Vercel serverless request limit. */
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

function downloadUrlFromFastFileJson(text: string): string | undefined {
  try {
    const data = JSON.parse(text) as { files?: { title?: string }[] };
    const title = data.files?.[0]?.title;
    if (title) return `https://fast-file.com/${title}/download`;
  } catch {
    /* ignore */
  }
  return undefined;
}

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
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [discordBanner, setDiscordBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const uploadIndexRef = useRef(1);

  const uploadOne = useCallback((file: File, uploadIndex: number) => {
    const originalExt = file.name.split(".").pop()?.trim().toLowerCase() || "mp4";
    const renamed = new File(
      [file],
      snippetVideoFilename(title || "Untitled", uploadIndex, originalExt),
      {
        type: file.type || "video/mp4",
        lastModified: file.lastModified,
      }
    );
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${renamed.name}-${Date.now()}`;
    setUploads((u) => [
      ...u,
      { id, name: renamed.name, size: renamed.size, progress: 0 },
    ]);

    const patchRow = (patch: Partial<UploadRow>) => {
      setUploads((u) =>
        u.map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
    };

    const uploadViaVercelProxy = () => {
      if (renamed.size > PROXY_MAX_BYTES) {
        patchRow({
          error:
            "Could not reach fast-file from the browser and file is too large for the server relay (~4MB). Try another network or upload via Discord.",
          progress: 0,
        });
        return;
      }
      const fd = new FormData();
      fd.append("file", renamed);
      const px = new XMLHttpRequest();
      px.upload.addEventListener("progress", (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        patchRow({ progress: pct });
      });
      px.addEventListener("load", () => {
        let data: { error?: string; files?: { downloadUrl?: string }[] } = {};
        try {
          data = JSON.parse(px.responseText) as typeof data;
        } catch {
          /* ignore */
        }
        if (px.status === 413) {
          if (data.error === "DISCORD_UPLOAD_NEEDED") {
            setDiscordBanner(true);
            patchRow({
              error: "Too large for fast-file",
              progress: 0,
            });
          } else {
            patchRow({
              error:
                "File too large for server upload. Direct browser upload should be used — try refreshing.",
              progress: 0,
            });
          }
          return;
        }
        if (px.status < 200 || px.status >= 300) {
          patchRow({
            error: data.error || "Upload failed",
            progress: 0,
          });
          return;
        }
        const downloadUrl = data.files?.[0]?.downloadUrl;
        patchRow({
          progress: 100,
          downloadUrl,
          error: downloadUrl ? undefined : "Invalid response",
        });
      });
      px.addEventListener("error", () => {
        patchRow({ error: "Network error", progress: 0 });
      });
      px.open("POST", "/api/upload");
      px.send(fd);
    };

    const fd = new FormData();
    fd.append("files", renamed, renamed.name);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      patchRow({ progress: pct });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status === 0) {
        uploadViaVercelProxy();
        return;
      }
      if (xhr.status === 413) {
        setDiscordBanner(true);
        patchRow({
          error: "Too large for fast-file",
          progress: 0,
        });
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const downloadUrl = downloadUrlFromFastFileJson(xhr.responseText);
        if (downloadUrl) {
          patchRow({ progress: 100, downloadUrl });
          return;
        }
        uploadViaVercelProxy();
        return;
      }
      uploadViaVercelProxy();
    });
    xhr.addEventListener("error", () => {
      uploadViaVercelProxy();
    });
    xhr.open("POST", FAST_FILE_UPLOAD);
    xhr.send(fd);
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
    const urls = uploads
      .map((u) => u.downloadUrl)
      .filter((x): x is string => Boolean(x));
    if (!title.trim() || !prod.trim()) {
      setSubmitError("Title and producer are required.");
      return;
    }
    if (urls.length === 0) {
      setSubmitError("Upload at least one video.");
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
        <label className="field-label">Files</label>
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
