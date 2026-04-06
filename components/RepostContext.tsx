import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { parseJsonResponse } from "@/lib/parse-json-response";

/** ISO time from POST /api/trigger-full-post-repost — correlates with GitHub Actions run */
const LS_FULL_POST_SINCE = "snippet_panel_full_post_since";

export type RepostJobApi = {
  jobId?: string;
  status: "running" | "done" | "error";
  step: string;
  snippetsTotal: number;
  snippetsPosted: number;
  messagesDeleted: number;
  errorMessage: string | null;
};

type WorkflowStatusPayload = {
  found: boolean;
  status?: string;
  conclusion?: string | null;
  running?: boolean;
  done?: boolean;
  failed?: boolean;
  success?: boolean;
};

type Ctx = {
  modalOpen: boolean;
  phase: "confirm" | "run";
  /** ISO timestamp used to match the GitHub Actions workflow run */
  jobId: string | null;
  job: RepostJobApi | null;
  running: boolean;
  error: string | null;
  repostUiVisible: boolean;
  openRepostFromMenu: () => void;
  closeModal: () => void;
  startRepost: () => Promise<void>;
  openRepostModal: () => void;
  dismissRepostJob: () => void;
};

const RepostContext = createContext<Ctx | null>(null);

export function useRepost(): Ctx {
  const c = useContext(RepostContext);
  if (!c) throw new Error("useRepost outside RepostProvider");
  return c;
}

const emptyJob = (status: RepostJobApi["status"], step: string): RepostJobApi => ({
  status,
  step,
  snippetsTotal: 0,
  snippetsPosted: 0,
  messagesDeleted: 0,
  errorMessage: null,
});

export function RepostProvider({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<"confirm" | "run">("confirm");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<RepostJobApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repostUiVisible, setRepostUiVisible] = useState(false);

  const running = job?.status === "running";

  useEffect(() => {
    if (!jobId || job?.status !== "running") return;

    const tick = async () => {
      try {
        const r = await fetch(
          `/api/full-post-workflow-status?since=${encodeURIComponent(jobId)}`
        );
        if (!r.ok) return;
        const d = await parseJsonResponse<WorkflowStatusPayload>(r);
        if (!d.found) return;
        if (d.running) return;
        if (d.success) {
          setJob(emptyJob("done", "done"));
          setError(null);
          try {
            localStorage.removeItem(LS_FULL_POST_SINCE);
          } catch {
            /* private mode */
          }
          return;
        }
        if (d.failed) {
          const msg = "GitHub Actions workflow failed";
          setJob((prev) =>
            prev
              ? { ...prev, status: "error", step: "done", errorMessage: msg }
              : emptyJob("error", "done")
          );
          setError(msg);
          try {
            localStorage.removeItem(LS_FULL_POST_SINCE);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    const t = setInterval(() => void tick(), 3000);
    return () => clearInterval(t);
  }, [jobId, job?.status]);

  const startRepost = useCallback(async () => {
    setError(null);
    setPhase("run");
    setJob(emptyJob("running", "action"));
    try {
      const start = await fetch("/api/trigger-full-post-repost", {
        method: "POST",
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        dispatchedAt?: string;
        error?: string;
      }>(start);
      if (!start.ok) throw new Error(data.error || "Failed to start");
      const since = data.dispatchedAt;
      if (!since) throw new Error("No dispatchedAt");
      setJobId(since);
      setRepostUiVisible(true);
      try {
        localStorage.setItem(LS_FULL_POST_SINCE, since);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPhase("confirm");
      setJob(null);
    }
  }, []);

  const openRepostFromMenu = useCallback(() => {
    if (running) {
      setPhase("run");
      setModalOpen(true);
      return;
    }
    if (
      repostUiVisible &&
      jobId &&
      (job?.status === "done" || job?.status === "error")
    ) {
      setPhase("run");
      setModalOpen(true);
      return;
    }
    setPhase("confirm");
    setModalOpen(true);
  }, [running, job?.status, repostUiVisible, jobId]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const openRepostModal = useCallback(() => {
    setModalOpen(true);
    if (jobId || job) setPhase("run");
  }, [jobId, job]);

  const dismissRepostJob = useCallback(() => {
    setRepostUiVisible(false);
    setJobId(null);
    setJob(null);
    setError(null);
    setPhase("confirm");
    try {
      localStorage.removeItem(LS_FULL_POST_SINCE);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      let since: string | null = null;
      try {
        since = localStorage.getItem(LS_FULL_POST_SINCE);
      } catch {
        return;
      }
      if (!since) return;

      try {
        const r = await fetch(
          `/api/full-post-workflow-status?since=${encodeURIComponent(since)}`
        );
        if (!r.ok) {
          localStorage.removeItem(LS_FULL_POST_SINCE);
          return;
        }
        const d = await parseJsonResponse<WorkflowStatusPayload>(r);
        if (cancelled) return;

        setJobId(since);
        setRepostUiVisible(true);
        setPhase("run");

        if (!d.found || d.running) {
          setJob(emptyJob("running", "action"));
          return;
        }
        if (d.success) {
          setJob(emptyJob("done", "done"));
          localStorage.removeItem(LS_FULL_POST_SINCE);
          return;
        }
        if (d.failed) {
          setJob({
            ...emptyJob("error", "done"),
            errorMessage: "GitHub Actions workflow failed",
          });
          setError("GitHub Actions workflow failed");
          localStorage.removeItem(LS_FULL_POST_SINCE);
        }
      } catch {
        try {
          localStorage.removeItem(LS_FULL_POST_SINCE);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      modalOpen,
      phase,
      jobId,
      job,
      running,
      error,
      repostUiVisible: repostUiVisible && Boolean(jobId),
      openRepostFromMenu,
      closeModal,
      startRepost,
      openRepostModal,
      dismissRepostJob,
    }),
    [
      modalOpen,
      phase,
      jobId,
      job,
      running,
      error,
      repostUiVisible,
      openRepostFromMenu,
      closeModal,
      startRepost,
      openRepostModal,
      dismissRepostJob,
    ]
  );

  return (
    <RepostContext.Provider value={value}>{children}</RepostContext.Provider>
  );
}
