import React from "react";
import { usePostingEstimate } from "@/hooks/usePostingEstimate";
import { useRepost } from "@/components/RepostContext";

export default function RepostModal() {
  const {
    modalOpen,
    closeModal,
    phase,
    job,
    running,
    error,
    startRepost,
  } = useRepost();
  const { data: est } = usePostingEstimate(modalOpen);

  if (!modalOpen) return null;

  const st = job?.step;

  return (
    <div className="modal-backdrop">
      <div className="panel modal">
        <div className="row-between" style={{ marginBottom: "1rem" }}>
          <h2>Repost snippets</h2>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.35rem 0.65rem" }}
            onClick={closeModal}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {phase === "confirm" && (
          <>
            <p style={{ lineHeight: 1.5, marginBottom: "1rem" }}>
              This will repost all snippets to the blank channel and swap
              channel visibility. You can close this window or the whole tab —
              the repost keeps running on the server; open the queue row anytime
              to watch progress.
            </p>
            {est && (
              <p
                className="subtle"
                style={{
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                  marginBottom: "1.25rem",
                }}
              >
                Repo has{" "}
                <span className="mono">{est.taggedSnippetCount}</span> tagged
                snippets. Manual repost typically takes{" "}
                <span className="mono">{est.repost.summary}</span> (Discord
                pacing + clearing the snippet channel + GitHub).
              </p>
            )}
            <div className="row" style={{ gap: "0.75rem" }}>
              <button type="button" className="btn btn-ghost" onClick={closeModal}>
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
            {est && (
              <p
                className="subtle"
                style={{
                  fontSize: "0.8rem",
                  marginBottom: "0.85rem",
                  lineHeight: 1.45,
                }}
              >
                Typical time for this archive was {est.repost.summary}. Progress
                below is step-by-step.
              </p>
            )}
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
                Working… (safe to close this tab — the server continues)
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
