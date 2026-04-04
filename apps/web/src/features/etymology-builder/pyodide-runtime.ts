import { useEffect, useMemo, useRef, useState } from "react";

type RuntimeState = {
  status: "idle" | "loading" | "ready" | "running" | "error";
  message?: string;
  output?: string;
};

type PyodideResponse = {
  command?: string;
  resp_html?: string;
  hash?: string;
  pyodideLoaded?: boolean;
};

const IFRAME_SRC = "/etymology/iframe_pyodide.html";

export function usePyodideRuntime(code: string, enabled: boolean) {
  const [state, setState] = useState<RuntimeState>({ status: "idle" });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const orderRef = useRef(0);
  const pendingHashRef = useRef<string | null>(null);
  const readyRef = useRef(false);

  const normalizedCode = useMemo(() => code.trim(), [code]);

  useEffect(() => {
    if (!enabled) {
      readyRef.current = false;
      pendingHashRef.current = null;
      setState({ status: "idle" });
      return;
    }
    if (readyRef.current) {
      setState((prev) => ({ ...prev, status: "ready" }));
    } else {
      setState({ status: "loading", message: "Carregando Pyodide..." });
    }
  }, [enabled]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<PyodideResponse>) => {
      if (!event.data) return;
      if (event.data.pyodideLoaded) {
        readyRef.current = true;
        setState({ status: "ready" });
        return;
      }

      if (!event.data.command || !event.data.command.includes("processBlockResponse")) {
        return;
      }

      if (pendingHashRef.current && event.data.hash !== pendingHashRef.current) {
        return;
      }

      setState({
        status: "ready",
        output: event.data.resp_html ?? "",
      });
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !readyRef.current) return;
    if (!normalizedCode) {
      setState((prev) => ({ ...prev, output: "" }));
      return;
    }

    const handle = window.setTimeout(() => {
      sendCode(normalizedCode);
    }, 300);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCode, enabled]);

  const sendCode = (payloadCode: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      setState({ status: "error", message: "Iframe do Pyodide indisponível." });
      return;
    }

    setState((prev) => ({ ...prev, status: "running" }));

    const orderid = orderRef.current;
    orderRef.current += 1;
    const hash = `${Date.now()}-${orderid}`;
    pendingHashRef.current = hash;

    iframe.contentWindow.postMessage(
      {
        command: "processBlock",
        orderid,
        html: `<pre>${escapeHtml(payloadCode)}</pre>`,
        hash,
      },
      "*",
    );
  };

  return {
    state,
    iframeProps: {
      ref: iframeRef,
      src: IFRAME_SRC,
      title: "pyodide-runtime",
    },
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
