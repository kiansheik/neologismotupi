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
  pyodideError?: string;
};

const BASE_IFRAME_SRC = "/etymology/iframe_pyodide.html";
const IFRAME_ID = "pyodide-runtime-iframe";

let sharedIframe: HTMLIFrameElement | null = null;

function ensureSharedIframe(src: string): HTMLIFrameElement | null {
  if (typeof document === "undefined") return null;
  if (sharedIframe && !document.body.contains(sharedIframe)) {
    document.body.appendChild(sharedIframe);
  }
  if (!sharedIframe) {
    const iframe = document.createElement("iframe");
    iframe.id = IFRAME_ID;
    iframe.title = "pyodide-runtime";
    iframe.style.display = "none";
    iframe.src = src;
    iframe.dataset.pyodideReady = "false";
    delete iframe.dataset.pyodideError;
    document.body.appendChild(iframe);
    sharedIframe = iframe;
  } else if (sharedIframe.src !== new URL(src, window.location.href).toString()) {
    sharedIframe.dataset.pyodideReady = "false";
    delete sharedIframe.dataset.pyodideError;
    sharedIframe.src = src;
  }
  return sharedIframe;
}

function buildIframeSrc(): string {
  if (import.meta.env.DEV && typeof __PYCATE_DEV_WHEEL_BASE__ !== "undefined" && __PYCATE_DEV_WHEEL_BASE__) {
    const params = new URLSearchParams({ wheelBase: __PYCATE_DEV_WHEEL_BASE__ });
    return `${BASE_IFRAME_SRC}?${params.toString()}`;
  }
  return BASE_IFRAME_SRC;
}

export function usePyodideRuntime(code: string, enabled: boolean) {
  const [state, setState] = useState<RuntimeState>({ status: "idle" });
  const [isReady, setIsReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const orderRef = useRef(0);
  const pendingHashRef = useRef<string | null>(null);
  const readyRef = useRef(false);

  const normalizedCode = useMemo(() => code.trim(), [code]);

  useEffect(() => {
    const iframe = ensureSharedIframe(buildIframeSrc());
    iframeRef.current = iframe;
    if (iframe?.dataset.pyodideReady === "true") {
      readyRef.current = true;
      setIsReady(true);
      if (enabled) {
        setState({ status: "ready" });
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
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
        setIsReady(true);
        if (iframeRef.current) {
          iframeRef.current.dataset.pyodideReady = "true";
          delete iframeRef.current.dataset.pyodideError;
        }
        setState({ status: "ready" });
        return;
      }
      if (event.data.pyodideError) {
        readyRef.current = false;
        if (iframeRef.current) {
          iframeRef.current.dataset.pyodideError = event.data.pyodideError;
        }
        setState({ status: "error", message: event.data.pyodideError });
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
    if (!enabled || !isReady) return;
    if (!normalizedCode) {
      setState((prev) => ({ ...prev, output: "" }));
      return;
    }

    const handle = window.setTimeout(() => {
      sendCode(normalizedCode);
    }, 300);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCode, enabled, isReady]);

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
