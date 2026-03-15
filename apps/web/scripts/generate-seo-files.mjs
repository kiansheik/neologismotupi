import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const FALLBACK_SITE_URL = "https://neo.academiatupi.com";
const FALLBACK_API_BASE_URL = "https://api.academiatupi.com/api";
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

function normalizeSiteUrl(value) {
  const raw = (value || "").trim();
  if (!raw) {
    return FALLBACK_SITE_URL;
  }
  return raw.replace(/\/+$/, "");
}

function resolveSiteUrl() {
  return normalizeSiteUrl(process.env.VITE_SITE_URL || process.env.SITE_URL);
}

function resolveApiBaseUrl() {
  const raw = (process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || "").trim();
  if (!raw) {
    return FALLBACK_API_BASE_URL;
  }
  return raw.replace(/\/+$/, "");
}

function toAbsolute(siteUrl, routePath) {
  return new URL(routePath.startsWith("/") ? routePath : `/${routePath}`, siteUrl).toString();
}

async function fetchApprovedEntries() {
  const apiBaseUrl = resolveApiBaseUrl();
  const collected = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const endpoint = new URL(`${apiBaseUrl}/entries`);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("page_size", String(PAGE_SIZE));
    endpoint.searchParams.set("status", "approved");
    endpoint.searchParams.set("sort", "recent");

    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch approved entries: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const item of items) {
      if (!item?.slug) {
        continue;
      }
      collected.push({
        path: `/entries/${item.slug}`,
        lastmod: item.updated_at || item.created_at || null,
      });
    }

    const total = Number(payload.total || 0);
    const loaded = page * PAGE_SIZE;
    if (!items.length || (total > 0 && loaded >= total)) {
      break;
    }
  }

  return collected;
}

function buildSitemapXml(siteUrl, entryRoutes) {
  const now = new Date().toISOString();
  const staticRoutes = [
    { path: "/", changefreq: "daily", priority: "1.0", lastmod: now },
    { path: "/submit", changefreq: "weekly", priority: "0.6", lastmod: now },
  ];

  const allRoutes = [...staticRoutes, ...entryRoutes.map((item) => ({
    path: item.path,
    changefreq: "weekly",
    priority: "0.8",
    lastmod: item.lastmod || now,
  }))];

  const uniqueByPath = new Map();
  for (const route of allRoutes) {
    uniqueByPath.set(route.path, route);
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const route of uniqueByPath.values()) {
    lines.push("  <url>");
    lines.push(`    <loc>${toAbsolute(siteUrl, route.path)}</loc>`);
    lines.push(`    <lastmod>${new Date(route.lastmod).toISOString()}</lastmod>`);
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
    lines.push(`    <priority>${route.priority}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

function buildRobotsTxt(siteUrl) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /me",
    "Disallow: /moderation",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /recover",
    "Disallow: /verify-email",
    "Disallow: /reset-password",
    `Sitemap: ${toAbsolute(siteUrl, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

async function main() {
  const siteUrl = resolveSiteUrl();
  const distDir = path.resolve(process.cwd(), "dist");
  await mkdir(distDir, { recursive: true });

  let entryRoutes = [];
  try {
    entryRoutes = await fetchApprovedEntries();
    console.log(`[seo] Collected ${entryRoutes.length} approved entries for sitemap.`);
  } catch (error) {
    console.warn(
      `[seo] Could not fetch approved entries; generating static sitemap only. ${String(error)}`,
    );
  }

  const sitemapXml = buildSitemapXml(siteUrl, entryRoutes);
  const robotsTxt = buildRobotsTxt(siteUrl);

  await writeFile(path.join(distDir, "sitemap.xml"), sitemapXml, "utf8");
  await writeFile(path.join(distDir, "robots.txt"), robotsTxt, "utf8");
  console.log("[seo] Wrote dist/sitemap.xml and dist/robots.txt");
}

main().catch((error) => {
  console.error("[seo] Failed to generate SEO files.", error);
  process.exitCode = 1;
});

