import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { RootEntry } from "./builder-types";
import type { SearchResult } from "./dictionary-search";
import { normalizeNoAccent } from "./orthography";
import { compactDefinition, defaultPosInfo, formatPosDisplay, parsePosInfo } from "./pos";

type DictionaryResultCardProps = {
  result: SearchResult;
  onPick: (entry: RootEntry) => void;
  compact?: boolean;
};

export function DictionaryResultCard({ result, onPick, compact }: DictionaryResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const parsedPos = parsePosInfo(result.definition);
  const posInfo = parsedPos ?? defaultPosInfo();
  const posDisplay = formatPosDisplay(posInfo);
  const gloss = compactDefinition(result.definition);
  const definition = result.definition?.trim() || "";
  const MAX_DEF_LEN = 150;
  const shouldTruncate = definition.length > MAX_DEF_LEN;
  const displayDefinition =
    expanded || !shouldTruncate ? definition : `${definition.slice(0, MAX_DEF_LEN).trim()}…`;
  const rawLower = (result.first_word || "").toLowerCase();
  const normalized = normalizeNoAccent(result.first_word || "");
  const orthVariants = normalized && normalized !== rawLower ? [normalized] : [];

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">{result.first_word}</p>
            {result.optional_number ? (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                {result.optional_number}
              </span>
            ) : null}
            {result.type === "neo" ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                neo
              </span>
            ) : null}
            {result.exact_match ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                exato
              </span>
            ) : null}
          </div>
          <p className={compact ? "mt-1 text-[11px] text-slate-600" : "mt-1 text-xs text-slate-600"}>
            {displayDefinition || "—"}
          </p>
          {shouldTruncate ? (
            <button
              type="button"
              className="mt-1 text-[11px] text-brand-700 underline"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? "Mostrar menos" : "Mostrar mais"}
            </button>
          ) : null}
          {posDisplay ? (
            <p className="mt-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">{posDisplay.primary}</span>
              {posDisplay.secondary ? ` ${posDisplay.secondary}` : null}
            </p>
          ) : null}
          {orthVariants.length > 0 ? (
            <p className="mt-1 text-[11px] text-slate-500">Sem diacríticos: {orthVariants[0]}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onPick({
              headword: result.first_word,
              gloss,
              posAbbrev: posInfo.abbrev,
              posLabel: posInfo.label,
              posKind: posInfo.kind,
              posAssumed: posInfo.assumed,
              type: result.type,
              orthVariants,
              rawDefinition: result.definition,
            })
          }
        >
          Selecionar
        </Button>
      </div>
    </div>
  );
}
