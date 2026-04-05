import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import type { BuilderStore } from "./builder-store";
import { usePyodideRuntime } from "./pyodide-runtime";
import { extractVerbeteFromOutput } from "./runtime-output";

type ProModeEditorProps = {
  store: BuilderStore;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
  onApplyHeadword: (headword: string) => void;
};

export function ProModeEditor({ store, onApplyNote, isManualOverride, onApplyHeadword }: ProModeEditorProps) {
  const [rawText, setRawText] = useState("");
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);
  const [autoSeeded, setAutoSeeded] = useState(false);
  const draftText = store.pydicatePreview;
  const hasDiverged = rawText.trim().length > 0 && rawText.trim() !== draftText.trim();

  useEffect(() => {
    if (autoSeeded) return;
    if (store.pydicatePreview) {
      setRawText(store.pydicatePreview);
      setAutoSeeded(true);
    }
  }, [store.pydicatePreview, autoSeeded]);

  const { state: runtimeState, iframeProps } = usePyodideRuntime(rawText, runtimeEnabled);
  const runtimeVerbete = extractVerbeteFromOutput(runtimeState.output);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
        <p className="text-sm font-semibold text-amber-900">Modo Pro</p>
        <p className="mt-1 text-xs text-amber-800">
          Pydicate bruto. Alterações aqui não são reimportadas automaticamente para os modos simples/avançado.
        </p>
      </section>

      <section className="rounded-md border border-brand-100 bg-white/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand-900">Editor pydicate</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (hasDiverged && !window.confirm("Substituir o texto atual pelo rascunho da estrutura?")) {
                return;
              }
              setRawText(draftText);
            }}
          >
            Carregar rascunho da estrutura
          </Button>
        </div>
        {hasDiverged ? (
          <p className="mt-1 text-[11px] text-amber-700">
            O texto atual divergiu do rascunho da estrutura.
          </p>
        ) : null}
        <Textarea
          className="mt-2 min-h-[160px] font-mono text-xs"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="Cole ou edite o pydicate aqui..."
        />
      </section>

      <section className="rounded-md border border-brand-100 bg-white/70 p-3">
        <p className="text-sm font-semibold text-brand-900">Execução</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={runtimeEnabled}
              onChange={(event) => setRuntimeEnabled(event.target.checked)}
            />
            Executar pydicate (Pyodide)
          </label>
          {runtimeState.status === "loading" ? (
            <span className="text-[11px] text-slate-500">{runtimeState.message || "Carregando..."}</span>
          ) : null}
          {runtimeState.status === "running" ? (
            <span className="text-[11px] text-slate-500">Executando...</span>
          ) : null}
          {runtimeState.status === "error" && runtimeState.message ? (
            <span className="text-[11px] text-amber-700">{runtimeState.message}</span>
          ) : null}
        </div>
        <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800">
          {runtimeEnabled ? runtimeState.output || runtimeState.message || "—" : "Runtime desativado."}
        </div>
        {runtimeEnabled ? <iframe {...iframeProps} className="hidden" /> : null}
      </section>

      <section className="rounded-md border border-brand-100 bg-white/70 p-3">
        <p className="text-sm font-semibold text-brand-900">Nota gerada da estrutura atual</p>
        <p className="mt-1 text-xs text-slate-600">
          Use esta nota se preferir sincronizar a partir do modo avançado.
        </p>
        <div className="mt-2 rounded-md border border-brand-100 bg-white px-2 py-2 text-sm text-slate-800">
          {store.generatedNote || "—"}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onApplyNote(store.generatedNote);
              if (runtimeVerbete) {
                onApplyHeadword(runtimeVerbete);
              }
            }}
            disabled={!store.generatedNote}
          >
            Usar no campo abaixo
          </Button>
          {isManualOverride ? (
            <p className="text-xs text-amber-700">
              Texto editado manualmente. Clique em “Usar” para sobrescrever.
            </p>
          ) : null}
          {runtimeVerbete ? (
            <p className="text-xs text-slate-500">
              Verbete gerado: {runtimeVerbete}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
