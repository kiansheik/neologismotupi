const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? "").trim();
const GA_SCRIPT_SRC = "https://www.googletagmanager.com/gtag/js";
const PAGE_VIEW_DEDUPE_WINDOW_MS = 800;

type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let isInitialized = false;
let lastPageView: { path: string; at: number } | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanParams(params: AnalyticsParams): Record<string, AnalyticsValue> {
  const cleaned: Record<string, AnalyticsValue> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    cleaned[key] = value;
  });
  return cleaned;
}

function sanitizeEventName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const safeName = normalized.length > 0 ? normalized : "event";
  return safeName.slice(0, 40);
}

export function isAnalyticsEnabled(): boolean {
  return isBrowser() && GA_MEASUREMENT_ID.length > 0;
}

export function initAnalytics(): void {
  if (!isAnalyticsEnabled() || isInitialized) {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    });

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
    transport_type: "beacon",
  });

  const existing = document.querySelector<HTMLScriptElement>('script[data-ga-script="1"]');
  if (!existing) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `${GA_SCRIPT_SRC}?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    script.dataset.gaScript = "1";
    document.head.appendChild(script);
  }

  isInitialized = true;
}

export function trackPageView(path: string): void {
  if (!isAnalyticsEnabled()) {
    return;
  }

  const now = Date.now();
  if (lastPageView && lastPageView.path === path && now - lastPageView.at < PAGE_VIEW_DEDUPE_WINDOW_MS) {
    return;
  }

  initAnalytics();
  lastPageView = { path, at: now };

  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    language: document.documentElement.lang || navigator.language,
  });
}

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (!isAnalyticsEnabled()) {
    return;
  }
  initAnalytics();
  window.gtag?.("event", sanitizeEventName(name), cleanParams(params));
}
