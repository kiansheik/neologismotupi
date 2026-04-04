import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RootEntry } from "./builder-types";
import { DictionaryResultCard } from "./DictionaryResultCard";
import { useDictionaryIndex, useDictionaryResults } from "./dictionary-hooks";
import { compactDefinition, posInfoForKind, POS_OPTIONS } from "./pos";
import type { RootPosKind } from "./pos";

type RootPickerProps = {
  label: string;
  value: RootEntry | null;
  onChange: (entry: RootEntry | null) => void;
  placeholder?: string;
  allowManual?: boolean;
};

export function RootPicker({ label, value, onChange, placeholder, allowManual = true }: RootPickerProps) {
  const { index, error } = useDictionaryIndex();
  const [query, setQuery] = useState("");
  const [manualHeadword, setManualHeadword] = useState("");
  const [manualGloss, setManualGloss] = useState("");
  const [manualPosKind, setManualPosKind] = useState<RootPosKind>("noun");

  const results = useDictionaryResults(index, query, 8);

  const selectedSummary = useMemo(() => {
    if (!value) return null;
    const gloss = value.gloss ? compactDefinition(value.gloss) : undefined;
    return gloss ? `${value.headword} — ${gloss}` : value.headword;
  }, [value]);

  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
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
      {value ? (
        <div className="mt-2 text-sm text-slate-800">
          {selectedSummary}
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
            {index && query && results.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum resultado.</p>
            ) : null}
            {results.map((result) => (
              <DictionaryResultCard key={`${result.first_word}-${result.definition}`} result={result} onPick={onChange} compact />
            ))}
          </div>
          {allowManual ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-white/80 p-2">
              <p className="text-[11px] font-semibold text-slate-600">Adicionar manualmente</p>
              <div className="mt-2 grid gap-2">
                <Input
                  value={manualHeadword}
                  onChange={(event) => setManualHeadword(event.target.value)}
                  placeholder="Forma base (ex.: mba'e)"
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                  <select
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    value={manualPosKind}
                    onChange={(event) => setManualPosKind(event.target.value as RootPosKind)}
                  >
                    {POS_OPTIONS.map((option) => (
                      <option key={option.kind} value={option.kind}>
                        {option.abbrev} — {option.label}
                      </option>
                    ))}
                  </select>
                  <Input
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
