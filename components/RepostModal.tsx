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
              This will repost the full archive to the blank channel and swap
              channel visibility. The heavy work runs in{" "}
              <strong>GitHub Actions</strong> (long timeout). You can close this
              tab — check the Processing queue or the Actions tab on GitHub.
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
            <p
              className="subtle"
              style={{
                fontSize: "0.85rem",
                lineHeight: 1.5,
                marginBottom: "1rem",
              }}
            >
              Running <strong>full-archive-post</strong> on GitHub Actions
              (post all snippets, clear snippet channel, swap permissions). Safe
              to leave this page.
            </p>
            <StepLine
              active={running && job?.status !== "done"}
              done={job?.status === "done"}
              label={
                job?.status === "done"
                  ? "Done ✓"
                  : job?.status === "error"
                    ? "Failed"
                    : "Workflow in progress…"
              }
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
                Polling workflow status…
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
