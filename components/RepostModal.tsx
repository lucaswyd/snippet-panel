import React, { useEffect, useState } from "react";

type JobApi = {
  jobId?: string;
  status: "running" | "done" | "error";
  step: string;
  snippetsTotal: number;
  snippetsPosted: number;
  messagesDeleted: number;
  errorMessage: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function RepostModal({ open, onClose }: Props) {
  const [phase, setPhase] = useState<"confirm" | "run">("confirm");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase("confirm");
      setJobId(null);
      setJob(null);
      setError(null);
      setRunning(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !jobId || phase !== "run") return;
    const poll = setInterval(() => {
      void fetch(`/api/repost-status?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => r.json())
        .then((j: JobApi) => setJob(j))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(poll);
  }, [open, phase, jobId]);

  const startRepost = async () => {
    setError(null);
    setRunning(true);
    setPhase("run");
    try {
      const start = await fetch("/api/repost-start", { method: "POST" });
      const data = await start.json();
      if (!start.ok) throw new Error(data.error || "Failed to start");
      const id = data.jobId as string;
      setJobId(id);
      setJob({
        status: "running",
        step: "loading",
        snippetsTotal: 0,
        snippetsPosted: 0,
        messagesDeleted: 0,
        errorMessage: null,
      });

      let lastStatus = "running";
      while (lastStatus === "running") {
        const chunkRes = await fetch("/api/repost-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: id }),
        });
        const chunk = (await chunkRes.json()) as JobApi;
        if (!chunkRes.ok) {
          throw new Error((chunk as { error?: string }).error || "Chunk failed");
        }
        setJob(chunk);
        lastStatus = chunk.status;
        if (chunk.status === "error") {
          setError(chunk.errorMessage || "Unknown error");
          break;
        }
        if (chunk.status === "done") break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  const canClose =
    phase === "confirm" ||
    (!running && (job?.status === "done" || job?.status === "error"));

  const st = job?.step;

  return (
    <div className="modal-backdrop">
      <div className="panel modal">
        <div className="row-between" style={{ marginBottom: "1rem" }}>
          <h2>Repost snippets</h2>
          {canClose && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "0.35rem 0.65rem" }}
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>

        {phase === "confirm" && (
          <>
            <p style={{ lineHeight: 1.5, marginBottom: "1.25rem" }}>
              This will repost all snippets to the blank channel and swap
              channel visibility. Are you sure?
            </p>
            <div className="row" style={{ gap: "0.75rem" }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void startRepost()}
              >
                Confirm
              </button>
            </div>
          </>
        )}

        {phase === "run" && (
          <div className="mono" style={{ fontSize: "0.85rem" }}>
            <StepLine
              active={st === "loading"}
              done={
                st != null &&
                st !== "loading" &&
                [
                  "posting",
                  "deleting",
                  "permissions",
                  "done",
                ].includes(st)
              }
              label="Loading snippets…"
            />
            <StepLine
              active={st === "posting"}
              done={
                st != null &&
                ["deleting", "permissions", "done"].includes(st)
              }
              label={`Posting snippets… ${job ? `${job.snippetsPosted}/${Math.max(job.snippetsTotal, 1)}` : ""}`}
            />
            <StepLine
              active={st === "deleting"}
              done={st != null && ["permissions", "done"].includes(st)}
              label={`Deleting old messages… (${job?.messagesDeleted ?? 0} removed)`}
            />
            <StepLine
              active={st === "permissions"}
              done={st === "done" || job?.status === "done"}
              label="Updating permissions…"
            />
            <StepLine
              active={false}
              done={job?.status === "done"}
              label="Done ✓"
            />
            {error && (
              <p style={{ color: "var(--danger)", marginTop: "1rem" }}>
                {error}
              </p>
            )}
            {job?.status === "error" && job.errorMessage && (
              <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>
                {job.errorMessage}
              </p>
            )}
            {running && (
              <p className="subtle" style={{ marginTop: "1rem" }}>
                Working…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepLine({
  active,
  done,
  label,
}: {
  active?: boolean;
  done?: boolean;
  label: string;
}) {
  const color = done
    ? "var(--success)"
    : active
      ? "var(--info)"
      : "var(--text-muted)";
  return (
    <div style={{ marginBottom: "0.5rem", color }}>
      {done ? "✓ " : active ? "→ " : "○ "}
      {label}
    </div>
  );
}
