import { useEffect, useMemo, useRef, useState } from "react";
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
  const [panelAlign, setPanelAlign] = useState<"left" | "right" | "center">("left");
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

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
    const headword = navarroEntry?.first_word?.trim();
    return buildNavarroExternalSearch(headword ?? "");
  }, [navarroEntry]);

  useEffect(() => {
    if (!isOpen) {
      setExpanded(false);
      return;
    }
    const updateAlignment = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) {
        return;
      }
      const padding = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      if (triggerRect.left + panelWidth > window.innerWidth - padding) {
        if (triggerRect.right - panelWidth < padding) {
          setPanelAlign("center");
        } else {
          setPanelAlign("right");
        }
      } else {
        setPanelAlign("left");
      }
    };
    updateAlignment();
    window.addEventListener("resize", updateAlignment);
    return () => {
      window.removeEventListener("resize", updateAlignment);
    };
  }, [isOpen, navarroEntry, entryDetail, label]);

  const panelAlignClass =
    panelAlign === "left"
      ? "left-0"
      : panelAlign === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  const definitionText =
    token.type === "dta"
      ? navarroEntry?.definition ?? t("inlineRef.loading")
      : entryDetail?.short_definition ?? t("inlineRef.loading");
  const canToggleDefinition = definitionText.length > 160;

  return (
    <span
      ref={triggerRef}
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
        <div
          ref={panelRef}
          className={`absolute z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-line-strong bg-surface-input p-3 text-sm shadow-lg ${panelAlignClass}`}
        >
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
              <p
                className={`mt-1 text-sm text-slate-700 ${
                  expanded ? "" : "max-h-24 overflow-hidden"
                }`}
              >
                {definitionText}
              </p>
              {canToggleDefinition ? (
                <button
                  type="button"
                  className="mt-2 inline-flex text-xs font-semibold text-brand-700 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    setExpanded((prev) => !prev);
                  }}
                >
                  {expanded ? t("inlineRef.seeLess") : t("inlineRef.seeMore")}
                </button>
              ) : null}
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
              <p
                className={`mt-1 text-sm text-slate-700 ${
                  expanded ? "" : "max-h-24 overflow-hidden"
                }`}
              >
                {definitionText}
              </p>
              {canToggleDefinition ? (
                <button
                  type="button"
                  className="mt-2 inline-flex text-xs font-semibold text-brand-700 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    setExpanded((prev) => !prev);
                  }}
                >
                  {expanded ? t("inlineRef.seeLess") : t("inlineRef.seeMore")}
                </button>
              ) : null}
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
