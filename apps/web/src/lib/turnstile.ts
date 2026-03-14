const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();
const TURNSTILE_TIMEOUT_MS = 6000;

type TurnstileRenderOptions = {
  sitekey: string;
  size?: "normal" | "compact" | "invisible";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<TurnstileApi | null> | null = null;

export function isTurnstileConfigured(): boolean {
  return TURNSTILE_SITE_KEY.length > 0;
}

function ensureTurnstileScript(): Promise<TurnstileApi | null> {
  if (!isTurnstileConfigured()) {
    return Promise.resolve(null);
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<TurnstileApi | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile ?? null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "1";
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export async function preloadTurnstile(): Promise<void> {
  await ensureTurnstileScript();
}

function createHiddenContainer(): HTMLDivElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);
  return container;
}

export async function getTurnstileToken(): Promise<string | null> {
  const api = await ensureTurnstileScript();
  if (!api) {
    return null;
  }

  const container = createHiddenContainer();
  if (!container) {
    return null;
  }

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    let widgetId: string | null = null;

    const finish = (token: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (widgetId) {
        try {
          api.remove(widgetId);
        } catch {
          // Ignore cleanup errors.
        }
      }
      container.remove();
      resolve(token);
    };

    const timeoutId = window.setTimeout(() => {
      finish(null);
    }, TURNSTILE_TIMEOUT_MS);

    widgetId = api.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      size: "invisible",
      callback: (token) => {
        window.clearTimeout(timeoutId);
        finish(token || null);
      },
      "error-callback": () => {
        window.clearTimeout(timeoutId);
        finish(null);
      },
      "expired-callback": () => {
        window.clearTimeout(timeoutId);
        finish(null);
      },
    });

    try {
      api.execute(widgetId);
    } catch {
      window.clearTimeout(timeoutId);
      finish(null);
    }
  });
}
