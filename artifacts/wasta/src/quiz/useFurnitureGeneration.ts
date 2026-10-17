import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Generation } from "./types";

// Adapted from Furniture3D's polling/history flow: store IDs, not expiring URLs.
export function useFurnitureGeneration() {
  const [taskId, setTaskId] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem("wasta-meshy-task") || undefined; } catch { return undefined; }
  });
  const [result, setResult] = useState<Generation>();
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prompt, setPrompt] = useState(() => {
    try { return sessionStorage.getItem("wasta-meshy-prompt") || ""; } catch { return ""; }
  });
  const run = useRef(0);
  const creating = useRef(false);
  const clear = useCallback(() => {
    run.current++; setTaskId(undefined); setResult(undefined); setPending(false); setSlow(false); setFailed(false);
    try { sessionStorage.removeItem("wasta-meshy-task"); sessionStorage.removeItem("wasta-meshy-prompt"); } catch { /* private browsing */ }
  }, []);
  const generate = async (text: string) => {
    if (creating.current) return;
    creating.current = true;
    clear();
    const version = run.current;
    setPending(true); setPrompt(text);
    try {
      const task = await api<{ taskId: string }>("/api/meshy/generate", { prompt: text });
      if (version !== run.current) return;
      setTaskId(task.taskId);
      try { sessionStorage.setItem("wasta-meshy-task", task.taskId); sessionStorage.setItem("wasta-meshy-prompt", text); } catch { /* optional */ }
    } catch { if (version === run.current) { setFailed(true); setPending(false); } }
    finally { creating.current = false; }
  };
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    setPending(true);
    async function poll() {
      try {
        const task = await api<Generation>(`/api/meshy/${encodeURIComponent(taskId!)}`, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setResult(task);
        if (task.status === "done" || task.status === "failed") {
          setFailed(task.status === "failed"); setPending(false); return;
        }
        if (Date.now() - started >= 240_000) setSlow(true);
        timer = setTimeout(poll, 3000);
      } catch {
        if (!controller.signal.aborted) { setFailed(true); setPending(false); }
      }
    }
    poll();
    const slowTimer = setTimeout(() => setSlow(true), 240_000);
    return () => { controller.abort(); clearTimeout(timer); clearTimeout(slowTimer); };
  }, [taskId]);
  return { taskId, result, pending, slow, failed, prompt, generate, clear };
}
