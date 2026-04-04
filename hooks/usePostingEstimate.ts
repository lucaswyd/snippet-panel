import { useEffect, useState } from "react";
import type { PostingEstimateApiResponse } from "@/lib/posting-estimates";

export function usePostingEstimate(enabled: boolean) {
  const [data, setData] = useState<PostingEstimateApiResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/posting-estimate")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: PostingEstimateApiResponse) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, error };
}
