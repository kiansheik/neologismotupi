import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { getSourceDetail } from "@/features/sources/api";
import { formatDate, formatDateTime } from "@/i18n/formatters";
import { useI18n } from "@/i18n";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";

function buildSourceTitle(
  authors: string | null,
  title: string | null,
  fallback: string,
): string {
  if (authors && title) {
    return `${authors} - ${title}`;
  }
  return authors || title || fallback;
}

export function SourceDetailPage() {
  const { workId } = useParams();
  const { t, locale } = useI18n();

  const sourceQuery = useQuery({
    queryKey: ["source", workId],
    queryFn: () => getSourceDetail(String(workId)),
    enabled: Boolean(workId),
  });

  const source = sourceQuery.data;
  const sourceTitle = source
    ? buildSourceTitle(source.authors, source.title, t("source.untitled"))
    : t("source.pageTitle");

  useSeo({
    title: `${sourceTitle} | ${t("source.pageTitle")}`,
    description: source
      ? t("source.seoDescription", {
          title: source.title ?? source.authors ?? t("source.untitled"),
          entries: source.entries_count,
          examples: source.examples_count,
        })
      : t("source.seoFallback"),
    canonicalPath: workId ? `/sources/${workId}` : "/sources",
    locale,
    structuredData: source
      ? {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: source.title ?? source.authors ?? t("source.untitled"),
          author: source.authors ?? undefined,
          url: buildAbsoluteUrl(`/sources/${source.work_id}`),
        }
      : null,
  });

  if (sourceQuery.isLoading) {
    return <p className="text-sm text-slate-700">{t("source.loading")}</p>;
  }

  if (sourceQuery.error || !source) {
    return <p className="text-sm text-red-700">{t("source.loadError")}</p>;
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{sourceTitle}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {t("source.entriesCount", { count: source.entries_count })}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {t("source.examplesCount", { count: source.examples_count })}
          </span>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">
          {t("source.editions")}
        </h2>
        {source.editions.length ? (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {source.editions.map((edition) => (
              <li
                key={edition.edition_id}
                className="rounded-md border border-brand-100 px-3 py-2"
              >
                <p className="font-medium text-slate-900">
                  {edition.publication_year ?? t("source.yearUnknown")}
                  {edition.edition_label ? ` - ${edition.edition_label}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t("source.entriesCount", { count: edition.entry_count })}
                  {" · "}
                  {t("source.examplesCount", { count: edition.example_count })}
                </p>
                {edition.links.length ? (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {t("source.mirrors")}
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                      {edition.links.map((link) => (
                        <li key={link.id}>
                          <a
                            className="break-all text-brand-700 hover:underline"
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.url}
                          </a>
                          <span className="ml-2 text-slate-500">
                            {t("source.linkAdded", {
                              date: formatDateTime(link.created_at, locale),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            {t("source.noEditions")}
          </p>
        )}
      </Card>

      <EntryBrowser
        compact
        queryKey={`source-${source.work_id}`}
        title={t("source.entries")}
        emptyMessage={t("source.noEntries")}
        scope={{ source_work_id: source.work_id }}
      />

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">
          {t("source.examples")}
        </h2>
        {source.examples.length ? (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {source.examples.map((example) => (
              <li
                key={example.id}
                className="rounded-md border border-brand-100 px-3 py-2"
              >
                <p className="text-slate-800">{example.sentence_original}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Link
                    className="text-brand-700 hover:underline"
                    to={`/entries/${example.entry_slug}`}
                  >
                    {t("source.inEntry", { headword: example.entry_headword })}
                  </Link>
                  <StatusBadge status={example.status} />
                  <span>{formatDate(example.created_at, locale)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            {t("source.noExamples")}
          </p>
        )}
      </Card>
    </section>
  );
}
