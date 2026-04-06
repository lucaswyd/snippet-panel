import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { parseJsonResponse } from "@/lib/parse-json-response";

const LS_JOB_ID = "snippet_panel_repost_job_id";

export type RepostJobApi = {
  jobId?: string;
  status: "running" | "done" | "error";
  step: string;
  snippetsTotal: number;
  snippetsPosted: number;
  messagesDeleted: number;
  errorMessage: string | null;
};

type Ctx = {
  modalOpen: boolean;
  phase: "confirm" | "run";
  jobId: string | null;
  job: RepostJobApi | null;
  /** True while the repost job status on the server is running (server continues even if tab is closed). */
  running: boolean;
  error: string | null;
  /** Row in Processing queue + resume after refresh while running */
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
          `/api/repost-status?jobId=${encodeURIComponent(jobId)}`
        );
        if (!r.ok) return;
        const j = await parseJsonResponse<RepostJobApi>(r);
        setJob(j);
        if (j.status === "error" && j.errorMessage) {
          setError(j.errorMessage);
        }
        if (j.status === "done" || j.status === "error") {
          try {
            localStorage.removeItem(LS_JOB_ID);
          } catch {
            /* private mode */
          }
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => clearInterval(t);
  }, [jobId, job?.status]);

  const startRepost = useCallback(async () => {
    setError(null);
    setPhase("run");
    setJob({
      status: "running",
      step: "loading",
      snippetsTotal: 0,
      snippetsPosted: 0,
      messagesDeleted: 0,
      errorMessage: null,
    });
    try {
      const start = await fetch("/api/repost-start", { method: "POST" });
      const data = await parseJsonResponse<{ jobId?: string; error?: string }>(
        start
      );
      if (!start.ok) throw new Error(data.error || "Failed to start");
      const id = data.jobId as string;
      setJobId(id);
      setRepostUiVisible(true);
      try {
        localStorage.setItem(LS_JOB_ID, id);
      } catch {
        /* ignore */
      }
      try {
        const r = await fetch(
          `/api/repost-status?jobId=${encodeURIComponent(id)}`
        );
        if (r.ok) {
          const j = await parseJsonResponse<RepostJobApi>(r);
          setJob(j);
          if (j.status === "error" && j.errorMessage) setError(j.errorMessage);
          if (j.status === "done" || j.status === "error") {
            try {
              localStorage.removeItem(LS_JOB_ID);
            } catch {
              /* ignore */
            }
          }
        }
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
      localStorage.removeItem(LS_JOB_ID);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      let id: string | null = null;
      try {
        id = localStorage.getItem(LS_JOB_ID);
      } catch {
        return;
      }
      if (!id) return;

      try {
        const r = await fetch(
          `/api/repost-status?jobId=${encodeURIComponent(id)}`
        );
        if (!r.ok) {
          localStorage.removeItem(LS_JOB_ID);
          return;
        }
        const j = await parseJsonResponse<RepostJobApi>(r);
        if (cancelled) return;

        setJobId(id);
        setJob(j);
        setRepostUiVisible(true);
        setPhase("run");

        if (j.status !== "running") {
          localStorage.removeItem(LS_JOB_ID);
        }
      } catch {
        try {
          localStorage.removeItem(LS_JOB_ID);
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
