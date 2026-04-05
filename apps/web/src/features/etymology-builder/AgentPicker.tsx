import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import type { RootEntry } from "./builder-types";
import { RootPicker } from "./RootPicker";
import { PRONOUN_GROUPS } from "./pydicate-pronouns";

type AgentPickerProps = {
  label: string;
  value: RootEntry | null;
  onChange: (entry: RootEntry | null) => void;
};

export function AgentPicker({ label, value, onChange }: AgentPickerProps) {
  const [showProperSearch, setShowProperSearch] = useState(false);

  const selectedId = value?.pydicateLiteral || value?.headword;
  const selectionSummary = useMemo(() => {
    if (!value) return null;
    const desc = value.rawDefinition?.trim();
    return desc ? `${value.headword} — ${desc}` : value.headword;
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
            Remover
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="mt-2 text-sm text-slate-800">{selectionSummary}</div>
      ) : null}

      <div className="mt-3 space-y-3">
        {PRONOUN_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{group.label}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {group.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={optionClass(selectedId === opt.id)}
                  onClick={() => onChange(opt.entry)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-white/80">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          onClick={() => setShowProperSearch((prev) => !prev)}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Nome próprio (buscar no dicionário)
          </span>
          <span className="text-[11px] text-slate-500">{showProperSearch ? "Ocultar" : "Opcional"}</span>
        </button>
        {showProperSearch ? (
          <div className="px-3 pb-3">
            <RootPicker
              label="Nome próprio"
              value={value && value.posKind === "proper_noun" ? value : null}
              onChange={(entry) => {
                if (entry) onChange(entry);
              }}
              placeholder="Buscar nomes próprios..."
              filterPosKinds={["proper_noun"]}
              manualPosKinds={["proper_noun"]}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function optionClass(active: boolean) {
  return `rounded-full border px-3 py-1 text-[11px] font-semibold ${
    active ? "border-brand-500 bg-brand-600 text-white" : "border-brand-200 bg-white text-brand-800 hover:border-brand-400"
  }`;
}
