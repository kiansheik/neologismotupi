import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RootEntry } from "./builder-types";
import { DictionaryResultCard } from "./DictionaryResultCard";
import { useDictionaryIndex, useDictionaryResults } from "./dictionary-hooks";
import { compactDefinition, posInfoForKind, POS_OPTIONS, parsePosInfo } from "./pos";
import type { RootPosKind } from "./pos";

type RootPickerProps = {
  label: string;
  value: RootEntry | null;
  onChange: (entry: RootEntry | null) => void;
  placeholder?: string;
  allowManual?: boolean;
  filterPosKinds?: RootPosKind[];
  manualPosKinds?: RootPosKind[];
};

export function RootPicker({
  label,
  value,
  onChange,
  placeholder,
  allowManual = true,
  filterPosKinds,
  manualPosKinds,
}: RootPickerProps) {
  const { index, error } = useDictionaryIndex();
  const [query, setQuery] = useState("");
  const [manualHeadword, setManualHeadword] = useState("");
  const [manualGloss, setManualGloss] = useState("");
  const [selectedExpanded, setSelectedExpanded] = useState(false);
  const [manualPosKind, setManualPosKind] = useState<RootPosKind>(
    manualPosKinds?.[0] ?? "noun",
  );

  const results = useDictionaryResults(index, query, 8);
  const allowedPosKinds = useMemo(() => {
    if (!filterPosKinds || filterPosKinds.length === 0) return null;
    return new Set(filterPosKinds);
  }, [filterPosKinds]);
  const filteredResults = useMemo(() => {
    if (!allowedPosKinds) return results;
    return results.filter((result) => {
      const parsed = parsePosInfo(result.definition);
      return parsed ? allowedPosKinds.has(parsed.kind) : false;
    });
  }, [results, allowedPosKinds]);
  const manualOptions = useMemo(() => {
    if (!manualPosKinds || manualPosKinds.length === 0) return POS_OPTIONS;
    const allowed = new Set(manualPosKinds);
    return POS_OPTIONS.filter((option) => allowed.has(option.kind));
  }, [manualPosKinds]);

  const selectedSummary = useMemo(() => {
    if (!value) return null;
    const fullDef = value.rawDefinition?.trim();
    const gloss = value.gloss ? compactDefinition(value.gloss) : undefined;
    const summary = fullDef || gloss;
    if (!summary) {
      return { headword: value.headword, summary: null };
    }
    const maxLen = 150;
    const shouldTruncate = summary.length > maxLen;
    const display = !shouldTruncate || selectedExpanded ? summary : `${summary.slice(0, maxLen).trim()}…`;
    return { headword: value.headword, summary: display, shouldTruncate };
  }, [value, selectedExpanded]);

  useEffect(() => {
    if (value) {
      setQuery("");
      setSelectedExpanded(false);
    }
  }, [value]);

  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-surface/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        {value ? (
          <button
            type="button"
            className="text-[11px] text-brand-700 underline"
            onClick={() => onChange(null)}
          >
            Trocar
          </button>
        ) : null}
      </div>
      {value && selectedSummary ? (
        <div className="mt-2 text-sm text-slate-800">
          <p className="font-semibold">{selectedSummary.headword}</p>
          {selectedSummary.summary ? (
            <p className="mt-1 text-[11px] text-slate-600">{selectedSummary.summary}</p>
          ) : null}
          {selectedSummary.shouldTruncate ? (
            <button
              type="button"
              className="mt-1 text-[11px] text-brand-700 underline"
              onClick={() => setSelectedExpanded((prev) => !prev)}
            >
              {selectedExpanded ? "Mostrar menos" : "Mostrar mais"}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder || "Digite um verbete ou glosa..."}
            />
          </div>
          <div className="mt-3 space-y-2">
            {!index && !error ? <p className="text-xs text-slate-500">Carregando dicionário...</p> : null}
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
            {index && query && filteredResults.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum resultado.</p>
            ) : null}
            {filteredResults.map((result) => (
              <DictionaryResultCard key={`${result.first_word}-${result.definition}`} result={result} onPick={onChange} compact />
            ))}
          </div>
          {allowManual ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-surface/80 p-2">
              <p className="text-[11px] font-semibold text-slate-600">Adicionar manualmente</p>
              <div className="mt-2 grid min-w-0 gap-2">
                <Input
                  className="w-full"
                  value={manualHeadword}
                  onChange={(event) => setManualHeadword(event.target.value)}
                  placeholder="Forma base (ex.: mba'e)"
                />
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                  <select
                    className="w-full min-w-0 rounded-md border border-slate-200 bg-surface-soft px-2 py-1 text-xs"
                    value={manualPosKind}
                    onChange={(event) => setManualPosKind(event.target.value as RootPosKind)}
                  >
                    {manualOptions.map((option) => (
                      <option key={option.kind} value={option.kind}>
                        {option.abbrev} — {option.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="w-full"
                    value={manualGloss}
                    onChange={(event) => setManualGloss(event.target.value)}
                    placeholder="Definição curta (opcional)"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const headword = manualHeadword.trim();
                    if (!headword) return;
                    const posInfo = posInfoForKind(manualPosKind);
                    onChange({
                      headword,
                      gloss: manualGloss.trim() || undefined,
                      posAbbrev: posInfo.abbrev,
                      posLabel: posInfo.label,
                      posKind: posInfo.kind,
                      posAssumed: false,
                      type: "manual",
                      rawDefinition: manualGloss.trim() || undefined,
                      pydicateLiteral: manualPosKind === "pronoun" ? headword : undefined,
                    });
                    setManualHeadword("");
                    setManualGloss("");
                    setManualPosKind("noun");
                  }}
                  disabled={!manualHeadword.trim()}
                >
                  Adicionar elemento
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
