import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { AgentPicker } from "./AgentPicker";
import type { BuilderStore } from "./builder-store";
import { makeObjectChoice } from "./builder-store";
import type { RootEntry } from "./builder-types";
import { DERIVE_OPERATIONS } from "./builder-types";
import { PIPELINE_DERIVATION_GROUPS, getPipelineDerivation } from "./pipeline-derivations";
import { posLabelForEntry } from "./pipeline-utils";
import { RootPicker } from "./RootPicker";
import { usePyodideRuntime } from "./pyodide-runtime";
import { extractVerbeteFromOutput } from "./runtime-output";

type SimplePipelineBuilderProps = {
  store: BuilderStore;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
  onApplyHeadword: (headword: string) => void;
};

export function SimplePipelineBuilder({ store, onApplyNote, isManualOverride, onApplyHeadword }: SimplePipelineBuilderProps) {
  const { state, meta } = store;
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);
  const [compositionOpen, setCompositionOpen] = useState(false);

  const { state: runtimeState } = usePyodideRuntime(store.pydicatePreview, runtimeEnabled);
  const runtimeVerbete = extractVerbeteFromOutput(runtimeState.output);

  const canAddDerivations =
    Boolean(state.base) && !(meta.currentStage === "verb" && meta.transitivity === "unknown");
  const currentStage = meta.currentStage;

  const lastObject = useMemo(() => {
    for (let i = state.steps.length - 1; i >= 0; i -= 1) {
      const step = state.steps[i];
      if (step.kind === "object") {
        return step.resolution;
      }
    }
    return null;
  }, [state.steps]);

  const typeLabel =
    meta.currentStage === "verb"
      ? meta.transitivity === "transitive"
        ? "verbo transitivo"
        : meta.transitivity === "intransitive"
          ? "verbo intransitivo"
          : "verbo (transitividade incerta)"
      : meta.currentStage === "noun"
        ? "substantivo"
        : meta.currentStage === "adverb"
          ? "advérbio"
          : "outro";
  const objectLabel =
    meta.requiresObject && !meta.objectResolved
      ? "objeto: pendente"
      : lastObject?.mode === "open"
        ? "objeto: em aberto"
        : lastObject?.entry
          ? `objeto: ${lastObject.entry.headword}`
          : "objeto: não aplicável";

  const availableGroups = useMemo(
    () =>
      PIPELINE_DERIVATION_GROUPS.map((group) => ({
        ...group,
        ops: group.ops,
      })),
    [],
  );
  const objectOptionalOps = new Set(["patient_pyra", "patient_emi"] as const);
  const isDerivationDisabled = (opKey: ReturnType<typeof getPipelineDerivation>["op"]) => {
    if (!state.base) return true;
    if (meta.currentStage === "verb" && meta.transitivity === "unknown") return true;
    if (meta.requiresObject && !meta.objectResolved && !objectOptionalOps.has(opKey)) return true;
    return false;
  };

  const resultPanel = (
    <section className="rounded-md border border-brand-100 bg-white/70 p-3">
      <p className="text-sm font-semibold text-brand-900">Resultado atual</p>
      <div className="mt-2 grid gap-3">
        <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
          <p className="text-[11px] text-slate-500">Classe atual: {typeLabel}</p>
          <p className="text-[11px] text-slate-500">{objectLabel}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold text-slate-600">Preview</p>
            <label className="flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={runtimeEnabled}
                onChange={(event) => setRuntimeEnabled(event.target.checked)}
              />
              Atualizar preview
            </label>
            {runtimeState.status === "loading" ? (
              <span className="text-[11px] text-slate-500">{runtimeState.message || "Carregando..."}</span>
            ) : null}
            {runtimeState.status === "running" ? <span className="text-[11px] text-slate-500">Executando...</span> : null}
            {runtimeState.status === "error" && runtimeState.message ? (
              <span className="text-[11px] text-amber-700">{runtimeState.message}</span>
            ) : null}
          </div>
          <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-[11px] text-slate-800">
            {runtimeEnabled ? runtimeState.output || runtimeState.message || "—" : "Runtime desativado."}
          </div>
          {runtimeVerbete ? <p className="mt-1 text-[11px] text-slate-500">Verbete gerado: {runtimeVerbete}</p> : null}
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
          <p className="text-[11px] font-semibold text-slate-600">Nota gerada</p>
          <p className="mt-1 text-[11px] text-slate-800">{store.generatedNote || "—"}</p>
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
              <p className="text-[11px] text-amber-700">
                Texto editado manualmente. Clique em “Usar” para sobrescrever.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1 space-y-4">
        <section className="rounded-md border border-brand-100 bg-white/70 p-3">
          <p className="text-sm font-semibold text-brand-900">Raiz base</p>
          <p className="mt-1 text-xs text-slate-600">Selecione a raiz principal para iniciar a composição.</p>
          <div className="mt-2">
            <RootPicker
            label="Raiz principal"
            value={state.base}
            onChange={(entry) => store.setBase(entry)}
            placeholder="Buscar verbo, substantivo ou outro predicado..."
          />
        </div>
        {state.base ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">{state.base.headword}</span>
              <span>{posLabelForEntry(state.base)}</span>
            </div>
            {state.base.rawDefinition || state.base.gloss ? (
              <p className="mt-1 text-[11px] text-slate-600">{state.base.rawDefinition || state.base.gloss}</p>
            ) : null}
            {meta.currentStage === "verb" && meta.transitivity === "unknown" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-amber-700">Transitividade não definida.</span>
                <select
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                  value={state.transitivityOverride || ""}
                  onChange={(event) =>
                    store.setTransitivityOverride(
                      event.target.value === "" ? null : (event.target.value as "transitive" | "intransitive"),
                    )
                  }
                >
                  <option value="">Desconhecida</option>
                  <option value="transitive">Transitivo</option>
                  <option value="intransitive">Intransitivo</option>
                </select>
              </div>
            ) : null}
            {meta.currentStage === "verb" && meta.transitivity && meta.transitivity !== "unknown" ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Transitividade: {meta.transitivity === "transitive" ? "transitivo" : "intransitivo"}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

        <section className="rounded-md border border-brand-100 bg-white/70 p-3">
          <p className="text-sm font-semibold text-brand-900">Operações (composição e derivações)</p>
          <p className="mt-1 text-xs text-slate-600">
            Adicione composições com “/” e derivações. A ordem pode ser ajustada.
          </p>

          {state.steps.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Nenhuma operação adicionada.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {state.steps.map((step, index) => {
                if (step.kind === "compose") {
                  return (
                    <div key={step.id} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">Composição (/)</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-slate-700"
                            onClick={() => store.moveStep(index, Math.max(0, index - 1))}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-slate-700"
                            onClick={() => store.moveStep(index, Math.min(state.steps.length - 1, index + 1))}
                            disabled={index === state.steps.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-rose-600 hover:text-rose-700"
                            onClick={() => store.removeStep(step.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <RootPicker
                          label="Elemento de composição"
                          value={step.entry}
                          onChange={(entry) => store.updateComposeStep(step.id, entry)}
                          placeholder="Buscar elemento..."
                        />
                      </div>
                    </div>
                  );
                }
                if (step.kind === "object") {
                  const mode = step.resolution.mode;
                  return (
                    <div key={step.id} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">Objeto do predicado</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-slate-700"
                            onClick={() => store.moveStep(index, Math.max(0, index - 1))}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-slate-700"
                            onClick={() => store.moveStep(index, Math.min(state.steps.length - 1, index + 1))}
                            disabled={index === state.steps.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-rose-600 hover:text-rose-700"
                            onClick={() => store.removeStep(step.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className={optionClass(mode === "generic_nonhuman")}
                          onClick={() => store.updateObjectStep(step.id, makeObjectChoice("generic_nonhuman"))}
                        >
                          Coisa (mba&apos;e)
                        </button>
                        <button
                          type="button"
                          className={optionClass(mode === "generic_human")}
                          onClick={() => store.updateObjectStep(step.id, makeObjectChoice("generic_human"))}
                        >
                          Pessoa (moro)
                        </button>
                        <button
                          type="button"
                          className={optionIconClass(mode === "root")}
                          onClick={() => store.updateObjectStep(step.id, { mode: "root" })}
                          aria-label="Buscar no dicionário"
                          title="Buscar no dicionário"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="11" cy="11" r="7" />
                            <path d="M20 20l-3.5-3.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={optionClass(mode === "manual")}
                          onClick={() => store.updateObjectStep(step.id, { mode: "manual" })}
                        >
                          Definir manualmente
                        </button>
                        <button
                          type="button"
                          className={optionClass(mode === "open")}
                          onClick={() => store.updateObjectStep(step.id, makeObjectChoice("open"))}
                        >
                          Deixar em aberto
                        </button>
                      </div>
                      {mode === "root" ? (
                        <div className="mt-3">
                          <RootPicker
                            label="Escolha o objeto"
                            value={step.resolution.entry ?? null}
                            onChange={(entry) => {
                              if (!entry) return;
                              store.updateObjectStep(step.id, makeObjectChoice("root", entry));
                            }}
                            allowManual={false}
                            placeholder="Buscar objeto..."
                          />
                        </div>
                      ) : null}
                      {mode === "manual" ? (
                        <div className="mt-3 rounded-md border border-slate-200 bg-white/80 p-2">
                          <p className="text-[11px] font-semibold text-slate-600">Objeto manual</p>
                          <ManualRootForm
                            onSubmit={(entry) => {
                              store.updateObjectStep(step.id, makeObjectChoice("manual", entry));
                            }}
                          />
                        </div>
                      ) : null}
                      {mode === "open" ? (
                        <p className="mt-2 text-[11px] text-amber-700">
                          Objeto deixado em aberto (forma verbal de dicionário).
                        </p>
                      ) : null}
                    </div>
                  );
                }
                const op = DERIVE_OPERATIONS[step.op];
                return (
                  <div key={step.id} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-800">{op.token}</span>
                        <span className="text-[11px] text-slate-500"> · {op.note}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-slate-700"
                          onClick={() => store.moveStep(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-slate-500 hover:text-slate-700"
                          onClick={() => store.moveStep(index, Math.min(state.steps.length - 1, index + 1))}
                          disabled={index === state.steps.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-rose-600 hover:text-rose-700"
                          onClick={() => store.removeStep(step.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                    {op.needsAgent ? (
                      <div className="mt-2">
                        <AgentPicker
                          label="Agente explícito"
                          value={step.agent ?? null}
                          onChange={(entry) => store.setDerivationAgent(step.id, entry)}
                        />
                        {!step.agent ? <p className="mt-1 text-[11px] text-amber-700">Agente pendente.</p> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 rounded-md border border-slate-200 bg-white/80">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setCompositionOpen((prev) => !prev)}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Modificadores de sentido (composição)
              </span>
              <span className="text-[11px] text-slate-500">
                {compositionOpen ? "Ocultar" : "Opcional"}
              </span>
            </button>
            {compositionOpen ? (
              <div className="px-3 pb-3">
                {state.base ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => store.addComposeStep()}>
                      Adicionar composição (/)
                    </Button>
                    <p className="mt-2 text-[11px] text-slate-500">
                      O elemento da composição será escolhido na lista de operações acima.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Selecione a raiz base para liberar a composição.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-white/80">
            <div className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Objeto</span>
              <span className="text-[11px] text-slate-500">Predicados transitivos</span>
            </div>
            <div className="px-3 pb-3">
              {state.base ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => store.addObjectStep()}>
                    Adicionar objeto
                  </Button>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Use quando o verbo exigir objeto (inclusive após causativos).
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Selecione a raiz base para liberar o objeto.</p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Adicionar derivação</p>
            {meta.currentStage === "verb" && meta.transitivity === "unknown" ? (
              <p className="text-xs text-amber-700">Defina a transitividade antes de aplicar derivações.</p>
            ) : null}
            {meta.requiresObject && !meta.objectResolved ? (
              <p className="text-xs text-amber-700">
                Defina o objeto antes de aplicar derivações (exceto pyra/emi) a um verbo transitivo.
              </p>
            ) : null}
            {!state.base ? (
              <p className="text-xs text-slate-500">Selecione uma raiz base para liberar as derivações.</p>
            ) : null}
            {availableGroups.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma derivação disponível.</p>
            ) : (
              availableGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{group.label}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {group.ops.map((opKey) => {
                      const spec = getPipelineDerivation(opKey);
                      const mismatch =
                        currentStage && !spec.appliesTo.includes(currentStage);
                      return (
                        <button
                          key={opKey}
                          type="button"
                          className={optionClass(false)}
                          onClick={() => store.addDerivationStep(opKey)}
                          disabled={!canAddDerivations || isDerivationDisabled(opKey)}
                        >
                          {spec.label} · {spec.description}
                          {mismatch ? " (fora do estágio atual)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
      <aside className="lg:w-80 xl:w-96">
        <div className="lg:sticky lg:top-4">{resultPanel}</div>
      </aside>
    </div>
  );
}

function optionClass(active: boolean) {
  return `rounded-full border px-3 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
    active ? "border-brand-500 bg-brand-600 text-white" : "border-brand-200 bg-white text-brand-800 hover:border-brand-400"
  }`;
}

function optionIconClass(active: boolean) {
  return `rounded-full border p-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
    active ? "border-brand-500 bg-brand-600 text-white" : "border-brand-200 bg-white text-brand-800 hover:border-brand-400"
  }`;
}

function ManualRootForm({ onSubmit }: { onSubmit: (entry: RootEntry) => void }) {
  const [headword, setHeadword] = useState("");
  const [gloss, setGloss] = useState("");

  return (
    <div className="mt-2 grid gap-2">
      <Input
        value={headword}
        onChange={(event) => setHeadword(event.target.value)}
        placeholder="Forma base (ex.: mba'e)"
      />
      <Input
        value={gloss}
        onChange={(event) => setGloss(event.target.value)}
        placeholder="Definição curta (opcional)"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const trimmed = headword.trim();
          if (!trimmed) return;
          onSubmit({
            headword: trimmed,
            gloss: gloss.trim() || undefined,
            posKind: "noun",
            posAbbrev: "s.",
            posLabel: "substantivo",
            posAssumed: false,
            type: "manual",
            rawDefinition: gloss.trim() || undefined,
          });
          setHeadword("");
          setGloss("");
        }}
        disabled={!headword.trim()}
      >
        Definir objeto
      </Button>
    </div>
  );
}
