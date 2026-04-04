import { useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_PYDICATE_API_BASE as string | undefined)?.trim() || "http://localhost:8080";
const SESSION_KEY = "pydicate_session_id";

export type RuntimeStatus = "idle" | "connecting" | "ready" | "running" | "error";

type RuntimeState = {
  status: RuntimeStatus;
  message?: string;
  output?: string;
  durationMs?: number;
};

type ExecuteResponsePayload = {
  session_id: string;
  stdout: string;
  stderr: string;
  output: string;
  duration_ms: number;
};

export function usePydicateRuntime(code: string, enabled: boolean) {
  const [state, setState] = useState<RuntimeState>({ status: "idle" });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  });
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    const ping = async () => {
      setState({ status: "connecting", message: "Conectando ao runtime..." });
      try {
        const resp = await fetch(`${API_BASE}/api/health`);
        if (!resp.ok) {
          throw new Error(`status ${resp.status}`);
        }
        if (!cancelled) {
          setState({ status: "ready" });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Runtime Python indisponível (use o backend do tupi-annotation-suite).",
          });
        }
      }
    };

    ping();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || state.status === "error" || state.status === "connecting") {
      return;
    }

    const trimmed = code.trim();
    if (!trimmed) {
      setState((prev) => ({ ...prev, output: "" }));
      return;
    }

    const handle = window.setTimeout(() => {
      void runCode(trimmed);
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, enabled, state.status]);

  const runCode = async (expression: string) => {
    const runId = ++runIdRef.current;
    setState((prev) => ({ ...prev, status: "running" }));

    try {
      const resp = await fetch(`${API_BASE}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: buildRuntimeCode(expression),
          session_id: sessionId,
        }),
      });

      if (!resp.ok) {
        throw new Error(`status ${resp.status}`);
      }

      const data = (await resp.json()) as ExecuteResponsePayload;
      if (runId !== runIdRef.current) return;

      if (!sessionId || data.session_id !== sessionId) {
        setSessionId(data.session_id);
        try {
          localStorage.setItem(SESSION_KEY, data.session_id);
        } catch {
          // ignore storage failures
        }
      }

      setState({
        status: "ready",
        output: data.output?.trim() || "[sem saída]",
        durationMs: data.duration_ms,
      });
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setState({
        status: "error",
        message: "Erro ao executar código no runtime Python.",
        output: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return state;
}

function buildRuntimeCode(expression: string): string {
  return `from pydicate.lang.tupilang.pos import *\nexpr = ${expression}\nprint(expr)\n`;
}
