import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useI18n } from "@/i18n";
import { getEntry } from "@/features/entries/api";
import { getNavarroEntryCached } from "@/features/navarro/cache";
import type { EntryDetail, NavarroEntry } from "@/lib/types";

import {
  buildNavarroExternalSearch,
  buildNavarroLabel,
  type InlineReferenceToken,
} from "../utils";

type InlineReferenceLinkProps = {
  token: InlineReferenceToken;
};

export function InlineReferenceLink({ token }: InlineReferenceLinkProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const navarroQuery = useQuery({
    queryKey: ["navarro", "entry", token.id],
    queryFn: () => getNavarroEntryCached(token.id),
    enabled: isOpen && token.type === "dta",
  });

  const entryQuery = useQuery({
    queryKey: ["entries", "detail", token.slug],
    queryFn: () => getEntry(token.slug ?? ""),
    enabled: isOpen && token.type === "neo" && Boolean(token.slug),
  });

  const navarroEntry = navarroQuery.data as NavarroEntry | undefined;
  const entryDetail = entryQuery.data as EntryDetail | undefined;

  const label = token.label || token.raw;

  const navarroExternalLink = useMemo(() => {
    if (!navarroEntry?.definition) {
      return "https://kiansheik.io/nhe-enga";
    }
    return buildNavarroExternalSearch(navarroEntry.definition);
  }, [navarroEntry]);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-brand-700 underline decoration-dotted underline-offset-2 hover:text-brand-900"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-md border border-line-strong bg-surface-input p-3 text-sm shadow-lg">
          {token.type === "dta" ? (
            <>
              <a
                className="inline-flex text-xs font-semibold text-brand-700 hover:underline"
                href={navarroExternalLink}
                target="_blank"
                rel="noreferrer"
              >
                {t("inlineRef.openNavarro")}
              </a>
              <p className="mt-2 text-xs uppercase text-slate-500">{t("inlineRef.navarroLabel")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {navarroEntry ? buildNavarroLabel(navarroEntry) : label}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {navarroEntry ? navarroEntry.definition : t("inlineRef.loading")}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase text-slate-500">{t("inlineRef.entryLabel")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {entryDetail?.headword || label}
              </p>
              <p className="text-xs text-slate-600">
                {entryDetail?.gloss_pt ?? ""}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {entryDetail?.short_definition ?? t("inlineRef.loading")}
              </p>
              {token.slug ? (
                <Link
                  className="mt-2 inline-flex text-xs font-semibold text-brand-700 hover:underline"
                  to={`/entries/${token.slug}`}
                >
                  {t("inlineRef.openEntry")}
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </span>
  );
}
