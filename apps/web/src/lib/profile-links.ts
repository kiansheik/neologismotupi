import type { TranslationKey } from "@/i18n/messages";
import type { Profile } from "@/lib/types";

export interface ProfileLinkItem {
  key: string;
  labelKey: TranslationKey;
  url: string;
  display: string;
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").trim();
  return cleaned.length ? cleaned : null;
}

function ensureHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

function normalizeHandle(value: string, prefixes: string[]): string {
  let handle = value.trim();
  for (const prefix of prefixes) {
    if (handle.toLowerCase().startsWith(prefix.toLowerCase())) {
      handle = handle.slice(prefix.length);
      break;
    }
  }
  handle = handle.replace(/^@+/, "");
  handle = handle.replace(/^\/+|\/+$/g, "");
  return handle;
}

export function buildProfileLinks(profile: Profile): ProfileLinkItem[] {
  const links: ProfileLinkItem[] = [];

  const website = cleanText(profile.website_url);
  if (website) {
    links.push({
      key: "website",
      labelKey: "profile.website",
      url: ensureHttps(website),
      display: website,
    });
  }

  const instagramRaw = cleanText(profile.instagram_handle);
  if (instagramRaw) {
    const handle = normalizeHandle(instagramRaw, [
      "https://instagram.com/",
      "https://www.instagram.com/",
      "http://instagram.com/",
      "http://www.instagram.com/",
    ]);
    if (handle) {
      links.push({
        key: "instagram",
        labelKey: "profile.instagram",
        url: `https://www.instagram.com/${handle}`,
        display: `@${handle}`,
      });
    }
  }

  const tiktokRaw = cleanText(profile.tiktok_handle);
  if (tiktokRaw) {
    const handle = normalizeHandle(tiktokRaw, [
      "https://tiktok.com/@",
      "https://www.tiktok.com/@",
      "http://tiktok.com/@",
      "http://www.tiktok.com/@",
      "https://tiktok.com/",
      "https://www.tiktok.com/",
      "http://tiktok.com/",
      "http://www.tiktok.com/",
    ]);
    if (handle) {
      links.push({
        key: "tiktok",
        labelKey: "profile.tiktok",
        url: `https://www.tiktok.com/@${handle}`,
        display: `@${handle}`,
      });
    }
  }

  const youtubeRaw = cleanText(profile.youtube_handle);
  if (youtubeRaw) {
    if (/^https?:\/\//i.test(youtubeRaw)) {
      links.push({
        key: "youtube",
        labelKey: "profile.youtube",
        url: youtubeRaw,
        display: youtubeRaw,
      });
    } else {
      const handle = normalizeHandle(youtubeRaw, [
        "https://youtube.com/",
        "https://www.youtube.com/",
        "http://youtube.com/",
        "http://www.youtube.com/",
      ]);
      if (handle) {
        const path = handle.startsWith("@") ? handle : `@${handle}`;
        links.push({
          key: "youtube",
          labelKey: "profile.youtube",
          url: `https://www.youtube.com/${path}`,
          display: path,
        });
      }
    }
  }

  const blueskyRaw = cleanText(profile.bluesky_handle);
  if (blueskyRaw) {
    const handle = normalizeHandle(blueskyRaw, [
      "https://bsky.app/profile/",
      "http://bsky.app/profile/",
    ]);
    if (handle) {
      links.push({
        key: "bluesky",
        labelKey: "profile.bluesky",
        url: `https://bsky.app/profile/${handle}`,
        display: handle.startsWith("@") ? handle : `@${handle}`,
      });
    }
  }

  return links;
}
