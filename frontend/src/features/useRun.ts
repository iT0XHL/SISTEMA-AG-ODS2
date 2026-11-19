import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../services/api";
import type { GenerationPoint, RunState } from "../types";

const POLL_MS = 350;

export function useRun(runId: string | null) {
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<GenerationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<GenerationPoint[]>([]);

  useEffect(() => {
    setRun(null);
    setHistory([]);
    setError(null);
    historyRef.current = [];
    if (!runId) return;
    let cancelled = false;
    let timer: number | undefined;
    let extraReads = 0;

    async function tick() {
      if (!runId) return;
      try {
        const state = await api.getRun(runId);
        const since = historyRef.current.length;
        const more = await api.getHistory(runId, since);
        if (cancelled) return;
        if (more.generations.length > 0) {
          historyRef.current = [...historyRef.current, ...more.generations];
          setHistory(historyRef.current);
        }
        setRun(state);
        const active = state.status === "queued" || state.status === "running";
        const incomplete = state.progress.generation + 1 > historyRef.current.length;
        if (active || (incomplete && extraReads < 5)) {
          if (!active) extraReads += 1;
          timer = window.setTimeout(tick, active ? POLL_MS : 150);
        }
      } catch (reason) {
        if (!cancelled) setError(errorMessage(reason));
      }
    }

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [runId]);

  return { run, history, error };
}
