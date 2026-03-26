import { useEffect } from "react";

import type { Locale } from "@/i18n";

interface SeoOptions {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
  ogType?: "website" | "article";
  locale?: Locale;
  structuredData?: Record<string, unknown> | null;
  disabled?: boolean;
}

const FALLBACK_SITE_URL = "https://neo.academiatupi.com";
const FALLBACK_SITE_NAME = "Academia Tupi - Dicionário de Tupi";
const STRUCTURED_DATA_ID = "nheenga-structured-data";

function getSiteUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return FALLBACK_SITE_URL;
}

export function buildAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = getSiteUrl();
  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, base).toString();
}

function resolveOgLocale(locale: Locale | undefined): string {
  if (locale === "en-US") {
    return "en_US";
  }
  return "pt_BR";
}

function setMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonical(url: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", url);
}

function setStructuredData(data: Record<string, unknown> | null): void {
  const existing = document.getElementById(STRUCTURED_DATA_ID);
  if (!data) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const element =
    existing instanceof HTMLScriptElement ? existing : document.createElement("script");
  element.id = STRUCTURED_DATA_ID;
  element.type = "application/ld+json";
  element.text = JSON.stringify(data);
  if (!existing) {
    document.head.appendChild(element);
  }
}

export function useSeo(options: SeoOptions): void {
  const {
    title,
    description,
    canonicalPath = "/",
    noindex = false,
    ogType = "website",
    locale,
    structuredData = null,
    disabled = false,
  } = options;

  useEffect(() => {
    if (disabled) {
      return;
    }
    const canonicalUrl = buildAbsoluteUrl(canonicalPath);
    const robots = noindex
      ? "noindex,nofollow,max-snippet:0,max-image-preview:none,max-video-preview:0"
      : "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1";

    document.title = title;
    setCanonical(canonicalUrl);
    setMeta("name", "description", description);
    setMeta("name", "robots", robots);
    setMeta("name", "googlebot", robots);

    setMeta("property", "og:site_name", FALLBACK_SITE_NAME);
    setMeta("property", "og:type", ogType);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:locale", resolveOgLocale(locale));

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);

    setStructuredData(structuredData);
  }, [canonicalPath, description, disabled, locale, noindex, ogType, structuredData, title]);
}
