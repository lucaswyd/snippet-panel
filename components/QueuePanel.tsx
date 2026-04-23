import React, { useEffect, useState } from "react";
import { useRepost } from "@/components/RepostContext";
import type { QueueItem } from "@/lib/snippets";

function badgeClass(status: QueueItem["status"]): string {
  switch (status) {
    case "pending":
      return "badge badge-pending";
    case "tagging":
      return "badge badge-tagging";
    case "posting":
      return "badge badge-posting";
    case "posting_private":
      return "badge badge-posting";
    case "posting_public":
      return "badge badge-posting";
    case "done":
      return "badge badge-done";
    case "error":
      return "badge badge-error";
    default:
      return "badge badge-pending";
  }
}

function label(status: QueueItem["status"]): string {
  switch (status) {
    case "pending":
      return "Waiting…";
    case "tagging":
      return "Tagging videos…";
    case "posting":
      return "Posting to Discord…";
    case "posting_private":
      return "Posting private (untagged)…";
    case "posting_public":
      return "Posting public (tagged)…";
    case "done":
      return "Done ✓";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export default function QueuePanel() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const {
    repostUiVisible,
    job,
    running,
    error: repostError,
    openRepostModal,
    dismissRepostJob,
  } = useRepost();

  const load = () => {
    void fetch("/api/queue")
      .then((r) => r.json())
      .then((data: QueueItem[]) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const sorted = [...items].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const dismiss = (id: string) => {
    void fetch(`/api/queue?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).then(() => load());
  };

  return (
    <div className="panel" style={{ padding: "1.5rem", height: "fit-content" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.15rem",
          margin: "0 0 1rem",
        }}
      >
        Processing queue
      </h2>
      {repostUiVisible && (
        <div
          className="queue-item"
          role="button"
          tabIndex={0}
          onClick={() => openRepostModal()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openRepostModal();
            }
          }}
          style={{ cursor: "pointer", marginBottom: "0.75rem" }}
        >
          <div
            className="row-between"
            style={{ alignItems: "flex-start", gap: "0.5rem" }}
          >
            <div>
              <div className="mono" style={{ fontSize: "0.9rem" }}>
                Repost all snippets
              </div>
              <div className="subtle" style={{ marginTop: "0.25rem" }}>
                {running
                  ? "GitHub Actions — click for details"
                  : job?.status === "done"
                    ? "Finished"
                    : job?.status === "error"
                      ? "Failed"
                      : "…"}
              </div>
            </div>
            <span
              className={
                job?.status === "done"
                  ? "badge badge-done"
                  : job?.status === "error"
                    ? "badge badge-error"
                    : running
                      ? "badge badge-posting"
                      : "badge badge-pending"
              }
            >
              {job?.status === "done"
                ? "Done ✓"
                : job?.status === "error"
                  ? "Error"
                  : running
                    ? "Running…"
                    : "…"}
            </span>
          </div>
          {repostError && (
            <p
              className="mono"
              style={{
                color: "var(--danger)",
                fontSize: "0.75rem",
                margin: "0.5rem 0 0",
              }}
            >
              {repostError}
            </p>
          )}
          {job?.status === "error" && job.errorMessage && (
            <p
              className="mono"
              style={{
                color: "var(--danger)",
                fontSize: "0.75rem",
                margin: "0.35rem 0 0",
              }}
            >
              {job.errorMessage}
            </p>
          )}
          {(job?.status === "done" || job?.status === "error") && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: "0.65rem", padding: "0.35rem 0.65rem" }}
              onClick={(e) => {
                e.stopPropagation();
                dismissRepostJob();
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
      {sorted.length === 0 && !repostUiVisible ? (
        <p className="subtle">No items yet.</p>
      ) : sorted.length > 0 ? (
        sorted.map((q) => (
          <div key={q.id} className="queue-item">
            <div
              className="row-between"
              style={{ alignItems: "flex-start", gap: "0.5rem" }}
            >
              <div>
                <div className="mono" style={{ fontSize: "0.9rem" }}>
                  {q.snippet.title}
                </div>
                <div className="subtle" style={{ marginTop: "0.25rem" }}>
                  {new Date(q.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={badgeClass(q.status)}>{label(q.status)}</span>
            </div>
            {q.status === "error" && q.errorMessage && (
              <p
                className="mono"
                style={{
                  color: "var(--danger)",
                  fontSize: "0.75rem",
                  margin: "0.5rem 0 0",
                }}
              >
                {q.errorMessage}
              </p>
            )}
            {(q.status === "done" || q.status === "error") && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: "0.65rem", padding: "0.35rem 0.65rem" }}
                onClick={() => dismiss(q.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        ))
      ) : null}
    </div>
  );
}
