import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [modifierKey, setModifierKey] = useState(0);
  const [objectKey, setObjectKey] = useState(0);
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);

  const { state: runtimeState, iframeProps } = usePyodideRuntime(store.pydicatePreview, runtimeEnabled);
  const runtimeVerbete = extractVerbeteFromOutput(runtimeState.output);

  const canAddDerivations =
    Boolean(state.base) &&
    !(meta.requiresObject && !meta.objectResolved) &&
    !(meta.currentStage === "verb" && meta.transitivity === "unknown");
  const currentStage = meta.currentStage;

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
    state.object?.mode === "open"
      ? "objeto: em aberto"
      : state.object?.entry
        ? `objeto: ${state.object.entry.headword}`
        : meta.requiresObject
          ? "objeto: pendente"
          : "objeto: não aplicável";
  const compositionSummary =
    state.base ? [state.base.headword, ...state.modifiers.map((item) => item.headword)].join(" / ") : "";

  const availableGroups = useMemo(
    () =>
      PIPELINE_DERIVATION_GROUPS.map((group) => ({
        ...group,
        ops: group.ops.filter((opKey) => {
          const spec = getPipelineDerivation(opKey);
          if (!currentStage) return false;
          return spec.appliesTo.includes(currentStage);
        }),
      })).filter((group) => group.ops.length > 0),
    [currentStage],
  );

  return (
    <div className="space-y-4">
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
        <p className="text-sm font-semibold text-brand-900">Modificadores de sentido</p>
        <p className="mt-1 text-xs text-slate-600">
          Adicione modificadores básicos. Eles serão combinados com o operador "/" na ordem escolhida.
        </p>
        {state.modifiers.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nenhum modificador adicionado.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {state.modifiers.map((modifier, index) => (
              <div key={`${modifier.headword}-${index}`} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{modifier.headword}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-700"
                      onClick={() => store.moveModifier(index, Math.max(0, index - 1))}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-slate-500 hover:text-slate-700"
                      onClick={() => store.moveModifier(index, Math.min(state.modifiers.length - 1, index + 1))}
                      disabled={index === state.modifiers.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="text-[11px] text-rose-600 hover:text-rose-700"
                      onClick={() => store.removeModifier(index)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
                {modifier.rawDefinition || modifier.gloss ? (
                  <p className="mt-1 text-[11px] text-slate-600">{modifier.rawDefinition || modifier.gloss}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {compositionSummary && state.modifiers.length > 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">Forma atual: {compositionSummary}</p>
        ) : null}
        <div className="mt-3">
          {state.base ? (
            <RootPicker
              key={`modifier-${modifierKey}`}
              label="Adicionar modificador"
              value={null}
              onChange={(entry) => {
                if (!entry) return;
                store.addModifier(entry);
                setModifierKey((prev) => prev + 1);
              }}
              placeholder="Buscar modificador..."
            />
          ) : (
            <p className="text-xs text-slate-500">Selecione a raiz base para adicionar modificadores.</p>
          )}
        </div>
      </section>

      {meta.currentStage === "verb" && (meta.requiresObject || meta.transitivity === "unknown") ? (
        <section className="rounded-md border border-brand-100 bg-white/70 p-3">
          <p className="text-sm font-semibold text-brand-900">Objeto obrigatório</p>
          <p className="mt-1 text-xs text-slate-600">
            Este predicado é transitivo. Resolva o objeto antes de aplicar derivações.
          </p>
          {meta.transitivity === "unknown" ? (
            <p className="mt-2 text-xs text-amber-700">
              Defina a transitividade acima para ativar a seleção de objeto.
            </p>
          ) : null}
          {meta.requiresObject ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className={optionClass(state.object?.mode === "generic_nonhuman")}
                  onClick={() => {
                    store.setObjectChoice(makeObjectChoice("generic_nonhuman"));
                  }}
                >
                  Coisa (mba&apos;e)
                </button>
                <button
                  type="button"
                  className={optionClass(state.object?.mode === "generic_human")}
                  onClick={() => {
                    store.setObjectChoice(makeObjectChoice("generic_human"));
                  }}
                >
                  Pessoa (moro)
                </button>
                <button
                  type="button"
                  className={optionClass(state.object?.mode === "root")}
                  onClick={() => {
                    store.setObjectChoice({ mode: "root" });
                    setObjectKey((prev) => prev + 1);
                  }}
                >
                  Buscar no dicionário
                </button>
                <button
                  type="button"
                  className={optionClass(state.object?.mode === "manual")}
                  onClick={() => {
                    store.setObjectChoice({ mode: "manual" });
                    setObjectKey((prev) => prev + 1);
                  }}
                >
                  Definir manualmente
                </button>
                <button
                  type="button"
                  className={optionClass(state.object?.mode === "open")}
                  onClick={() => store.setObjectChoice(makeObjectChoice("open"))}
                >
                  Deixar em aberto
                </button>
              </div>
              {state.object?.mode === "root" ? (
                <div className="mt-3">
                  <RootPicker
                    key={`object-root-${objectKey}`}
                    label="Escolha o objeto"
                    value={state.object.entry ?? null}
                    onChange={(entry) => {
                      if (!entry) return;
                      store.setObjectChoice(makeObjectChoice("root", entry));
                    }}
                    allowManual={false}
                    placeholder="Buscar objeto..."
                  />
                </div>
              ) : null}
              {state.object?.mode === "manual" ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-white/80 p-2">
                  <p className="text-[11px] font-semibold text-slate-600">Objeto manual</p>
                  <ManualRootForm
                    onSubmit={(entry) => {
                      store.setObjectChoice(makeObjectChoice("manual", entry));
                    }}
                  />
                </div>
              ) : null}
              {state.object?.mode === "open" ? (
                <p className="mt-2 text-[11px] text-amber-700">Objeto deixado em aberto (forma verbal de dicionário).</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border border-brand-100 bg-white/70 p-3">
        <p className="text-sm font-semibold text-brand-900">Derivações</p>
        <p className="mt-1 text-xs text-slate-600">
          Aplique derivações em cadeia. A lista abaixo mostra apenas opções compatíveis com o estágio atual.
        </p>
        {state.derivations.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Nenhuma derivação aplicada.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {state.derivations.map((derivation, index) => {
              const op = DERIVE_OPERATIONS[derivation.op];
              return (
                <div key={derivation.id} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-800">{op.token}</span>
                      <span className="text-[11px] text-slate-500"> · {op.note}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                        onClick={() => store.moveDerivation(index, Math.max(0, index - 1))}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-slate-500 hover:text-slate-700"
                        onClick={() => store.moveDerivation(index, Math.min(state.derivations.length - 1, index + 1))}
                        disabled={index === state.derivations.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-rose-600 hover:text-rose-700"
                        onClick={() => store.removeDerivation(derivation.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {op.needsAgent ? (
                    <div className="mt-2">
                      <RootPicker
                        label="Agente explícito"
                        value={derivation.agent ?? null}
                        onChange={(entry) => store.setDerivationAgent(derivation.id, entry)}
                        placeholder="Buscar agente..."
                      />
                      {!derivation.agent ? (
                        <p className="mt-1 text-[11px] text-amber-700">Agente pendente.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 space-y-2">
          {meta.currentStage === "verb" && meta.transitivity === "unknown" ? (
            <p className="text-xs text-amber-700">Defina a transitividade antes de aplicar derivações.</p>
          ) : null}
          {meta.requiresObject && !meta.objectResolved ? (
            <p className="text-xs text-amber-700">
              Defina o objeto antes de aplicar derivações a um verbo transitivo.
            </p>
          ) : null}
          {!state.base ? (
            <p className="text-xs text-slate-500">Selecione uma raiz base para liberar as derivações.</p>
          ) : null}
          {availableGroups.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma derivação disponível no estágio atual.</p>
          ) : (
            availableGroups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{group.label}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {group.ops.map((opKey) => {
                    const spec = getPipelineDerivation(opKey);
                    return (
                      <button
                        key={opKey}
                        type="button"
                        className={optionClass(false)}
                        onClick={() => store.addDerivation(opKey)}
                        disabled={!canAddDerivations || !state.base}
                      >
                        {spec.label} · {spec.description}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border border-brand-100 bg-white/70 p-3">
        <p className="text-sm font-semibold text-brand-900">Resultado atual</p>
        <div className="mt-2 grid gap-3">
          <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
            <p className="text-[11px] text-slate-500">Classe atual: {typeLabel}</p>
            <p className="text-[11px] text-slate-500">{objectLabel}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
            <p className="text-[11px] font-semibold text-slate-600">Pydicate</p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-800">
              {store.pydicatePreview || "—"}
            </pre>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-slate-600">Saída do Pyodide</p>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={runtimeEnabled}
                  onChange={(event) => setRuntimeEnabled(event.target.checked)}
                />
                Executar pydicate
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
            {runtimeEnabled ? <iframe {...iframeProps} className="hidden" /> : null}
            {runtimeVerbete ? (
              <p className="mt-1 text-[11px] text-slate-500">Verbete gerado: {runtimeVerbete}</p>
            ) : null}
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
    </div>
  );
}

function optionClass(active: boolean) {
  return `rounded-full border px-3 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
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
