import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /** True while the server job is running (client is driving /api/repost-chunk in a loop). */
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
  const [chunkLoopActive, setChunkLoopActive] = useState(false);

  const chunkBusy = useRef(false);

  const running =
    job?.status === "running" || chunkLoopActive;

  const runChunkLoop = useCallback(async (id: string) => {
    if (chunkBusy.current) return;
    chunkBusy.current = true;
    setChunkLoopActive(true);
    setError(null);
    try {
      let lastStatus = "running" as string;
      while (lastStatus === "running") {
        const chunkRes = await fetch("/api/repost-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: id }),
        });
        const chunk = await parseJsonResponse<
          RepostJobApi & { error?: string }
        >(chunkRes);
        if (!chunkRes.ok) {
          throw new Error(
            chunk.errorMessage ||
              (typeof chunk.error === "string" ? chunk.error : null) ||
              "Chunk failed"
          );
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
      chunkBusy.current = false;
      setChunkLoopActive(false);
      try {
        localStorage.removeItem(LS_JOB_ID);
      } catch {
        /* private mode */
      }
    }
  }, []);

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
      await runChunkLoop(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPhase("confirm");
      setJob(null);
    }
  }, [runChunkLoop]);

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

        if (j.status === "running") {
          void runChunkLoop(id);
        } else {
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
  }, [runChunkLoop]);

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
