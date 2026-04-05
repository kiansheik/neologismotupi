import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { BuilderStore } from "./builder-store";
import { toDisplayNode } from "./builder-render";
import { DERIVE_GROUPS, DERIVE_OPERATIONS, POSTPOSITION_OPTIONS } from "./builder-types";
import type { BuilderNode, DeriveOperation, PendingInsert, RootEntry } from "./builder-types";
import { DictionaryResultCard } from "./DictionaryResultCard";
import { useDictionaryIndex, useDictionaryResults } from "./dictionary-hooks";
import { describeNode } from "./note-export";
import { posInfoForKind, POS_OPTIONS } from "./pos";
import type { RootPosKind } from "./pos";
import { usePyodideRuntime } from "./pyodide-runtime";

type AdvancedModeEditorProps = {
  store: BuilderStore;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
};

type PreviewTab = "note" | "structure" | "pydicate";

export function AdvancedModeEditor({ store, onApplyNote, isManualOverride }: AdvancedModeEditorProps) {
  const [query, setQuery] = useState("");
  const [searchMinimized, setSearchMinimized] = useState(false);
  const [manualHeadword, setManualHeadword] = useState("");
  const [manualGloss, setManualGloss] = useState("");
  const [manualPosKind, setManualPosKind] = useState<RootPosKind>("noun");
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<PreviewTab>("note");

  const { index: searchIndex, error: searchError } = useDictionaryIndex();
  const results = useDictionaryResults(searchIndex, searchMinimized ? "" : query, 12);

  useEffect(() => {
    if (store.pendingInsert) {
      setSearchMinimized(false);
    }
  }, [store.pendingInsert]);

  useEffect(() => {
    if (!store.root) {
      setSearchMinimized(false);
    }
  }, [store.root]);

  const { state: runtimeState, iframeProps } = usePyodideRuntime(
    store.pydicatePreview,
    runtimeEnabled,
  );

  const pendingLabel = useMemo(() => {
    if (!store.pendingInsert) return null;
    const target = store.pendingInsert.targetId && store.root ? findNode(store.root, store.pendingInsert.targetId) : null;
    const targetLabel = target ? describeNode(target) : "";
    switch (store.pendingInsert.kind) {
      case "compound":
        return targetLabel ? `Adicionar raiz ao compósito de ${targetLabel}` : "Adicionar raiz ao compósito";
      case "combine":
        return targetLabel ? `Combinar com ${targetLabel}` : "Combinar com outra raiz";
      case "possessor":
        return targetLabel ? `Definir possuidor de ${targetLabel}` : "Definir possuidor";
      case "modifier":
        return targetLabel ? `Definir modificador de ${targetLabel}` : "Definir modificador";
      case "postposition":
        return targetLabel ? `Adicionar pós-posição em ${targetLabel}` : "Adicionar pós-posição";
      case "derive-agent":
        return targetLabel ? `Definir agente para ${targetLabel}` : "Definir agente";
      case "verb-subject":
        return targetLabel ? `Definir sujeito em ${targetLabel}` : "Definir sujeito";
      case "verb-object":
        return targetLabel ? `Definir objeto em ${targetLabel}` : "Definir objeto";
      default:
        return "Selecionar raiz";
    }
  }, [store.pendingInsert, store.root]);

  const handlePickRoot = (entry: RootEntry) => {
    store.applyRootEntry(entry);
    setQuery("");
    setSearchMinimized(true);
  };

  const handleAddManual = () => {
    const headword = manualHeadword.trim();
    if (!headword) return;
    const posInfo = posInfoForKind(manualPosKind);
    const gloss = manualGloss.trim();
    handlePickRoot({
      headword,
      gloss: gloss || undefined,
      posAbbrev: posInfo.abbrev,
      posLabel: posInfo.label,
      posKind: posInfo.kind,
      posAssumed: false,
      type: "manual",
      rawDefinition: gloss || undefined,
    });
    setManualHeadword("");
    setManualGloss("");
    setManualPosKind("noun");
  };

  const displayTree = store.root ? toDisplayNode(store.root) : null;
  const activeTargetId = store.activeNodeId ?? store.root?.id ?? null;
  const activeNode = activeTargetId && store.root ? findNode(store.root, activeTargetId) : null;
  const activeNodeLabel = activeNode ? nodeLabel(activeNode) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-900">Buscar raízes</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-slate-600 underline"
                onClick={() => {
                  if (!searchMinimized) {
                    setQuery("");
                  }
                  setSearchMinimized((prev) => !prev);
                }}
              >
                {searchMinimized ? "Reabrir busca" : "Minimizar"}
              </button>
              {pendingLabel ? (
                <button
                  type="button"
                  className="text-xs text-amber-700 underline"
                  onClick={() => store.setPendingInsert(null)}
                >
                  Cancelar seleção
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Pesquisa no dicionário nhe-enga por verbete ou significado (seção tupi→português).
          </p>
          {pendingLabel ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {pendingLabel}
            </p>
          ) : null}
          {searchMinimized ? (
            <div className="mt-2 rounded-md border border-dashed border-brand-200 bg-white/60 p-3 text-xs text-slate-600">
              Busca minimizada. Reabra para adicionar outra raiz.
            </div>
          ) : (
            <>
              <div className="mt-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Digite um verbete ou glosa..."
                />
              </div>
              <div className="mt-3 space-y-2">
                {!searchIndex && !searchError ? (
                  <p className="text-xs text-slate-500">Carregando dicionário...</p>
                ) : null}
                {searchError ? <p className="text-xs text-red-700">{searchError}</p> : null}
                {searchIndex && query && results.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum resultado para a busca.</p>
                ) : null}
                {results.map((result) => (
                  <DictionaryResultCard key={`${result.first_word}-${result.definition}`} result={result} onPick={handlePickRoot} />
                ))}
              </div>
              <div className="mt-3 rounded-md border border-slate-200 bg-white/70 p-2">
                <p className="text-xs font-semibold text-slate-700">Adicionar manualmente</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Use quando o verbete não estiver no dicionário.
                </p>
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
                  <Button type="button" variant="secondary" onClick={handleAddManual} disabled={!manualHeadword.trim()}>
                    Adicionar elemento
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="rounded-md border border-brand-100 bg-white/70 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-900">Construção estruturada</p>
            {store.root ? (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                onClick={() => {
                  store.setRoot(null);
                  store.setActiveNodeId(null);
                }}
              >
                Limpar tudo
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Selecione um nó para focar. Arraste derivadores sobre um nó para aplicar.
          </p>
          <div className="mt-3 rounded-md border border-slate-200 bg-white/80 p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">Banco de derivação</p>
              <p className="text-[11px] text-slate-500">
                Foco: {activeNodeLabel || "selecione um nó"}
              </p>
            </div>
            <div className="mt-2 space-y-2">
              {DERIVE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {group.ops.map((key) => {
                      const op = DERIVE_OPERATIONS[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("deriveOp", key);
                          }}
                          onClick={() => {
                            if (!activeTargetId) return;
                            store.applyDerive(activeTargetId, key);
                          }}
                          className="rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] text-brand-900 hover:border-brand-400"
                          title={op.label}
                          disabled={!activeTargetId}
                        >
                          <span className="font-semibold">{op.token}</span>
                          <span className="text-slate-600"> — {op.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Arraste para um nó ou clique para aplicar ao foco atual.
            </p>
          </div>
          {!store.root ? (
            <div className="mt-3 rounded-md border border-dashed border-brand-200 bg-white/60 p-3 text-xs text-slate-600">
              Comece selecionando uma raiz no painel de busca.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <NodeEditor
                node={store.root}
                onApplyDerive={store.applyDerive}
                onRemove={store.removeNode}
                onPending={store.setPendingInsert}
                onMoveChild={store.moveCompoundChild}
                onQuickPostposition={store.updatePostposition}
                onSwapDerive={store.swapDerive}
                activeNodeId={activeTargetId}
                onSelectNode={store.setActiveNodeId}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => store.setPendingInsert({ kind: "compound" })}>
              Adicionar outra raiz
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => store.setPendingInsert({ kind: "postposition", targetId: store.root?.id ?? "" })}
              disabled={!store.root}
            >
              Adicionar pós-posição
            </Button>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-md border border-brand-100 bg-white/70 p-3">
          <p className="text-sm font-semibold text-brand-900">Pré-visualizações</p>
          <p className="mt-1 text-xs text-slate-600">Saídas do modo avançado.</p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {(["note", "structure", "pydicate"] as PreviewTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full border px-3 py-1 ${
                  activeTab === tab
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {tab === "note" ? "Nota" : tab === "structure" ? "Estrutura" : "Pydicate"}
              </button>
            ))}
          </div>

          {activeTab === "note" ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-md border border-brand-100 bg-white px-2 py-2 text-sm text-slate-800">
                {store.generatedNote || "Construa uma raiz para gerar a nota."}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onApplyNote(store.generatedNote)}
                  disabled={!store.generatedNote}
                >
                  Usar no campo abaixo
                </Button>
                {isManualOverride ? (
                  <p className="text-xs text-amber-700">
                    Texto editado manualmente. Clique em “Usar” para sobrescrever.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "structure" ? (
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              {displayTree ? <StructuredTree node={displayTree} depth={0} /> : "Sem estrutura ainda."}
            </div>
          ) : null}

          {activeTab === "pydicate" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">
                Melhor esforço (assume substantivo quando a classe não é detectada).
              </p>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-800">
                {store.pydicatePreview || "—"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
              <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800">
                {runtimeEnabled ? runtimeState.output || runtimeState.message || "—" : "Runtime desativado."}
              </div>
              {runtimeEnabled ? <iframe {...iframeProps} className="hidden" /> : null}
              <div>
                <p className="text-xs font-semibold text-slate-700">Peças canônicas</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {store.pieces.length === 0 ? (
                    <span className="text-xs text-slate-500">—</span>
                  ) : (
                    store.pieces.map((piece, index) => (
                      <span
                        key={`${piece}-${index}`}
                        className="rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[11px] text-brand-800"
                      >
                        {piece}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function NodeEditor({
  node,
  onApplyDerive,
  onRemove,
  onPending,
  onMoveChild,
  onQuickPostposition,
  onSwapDerive,
  activeNodeId,
  onSelectNode,
}: {
  node: BuilderNode;
  onApplyDerive: (targetId: string, operation: DeriveOperation) => void;
  onRemove: (targetId: string) => void;
  onPending: (pending: PendingInsert | null) => void;
  onMoveChild: (compoundId: string, fromIndex: number, toIndex: number) => void;
  onQuickPostposition: (targetId: string, postposition: string) => void;
  onSwapDerive: (targetId: string) => void;
  activeNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const isActive =
    activeNodeId === node.id || (node.kind === "verb_argument" && node.value && activeNodeId === node.value.id);
  const isVerbArgument = node.kind === "verb_argument";
  const handleDropDerive = (event: DragEvent<HTMLDivElement>) => {
    const op = event.dataTransfer.getData("deriveOp");
    if (op) {
      event.preventDefault();
      if (node.kind === "verb_argument" && !node.value) return;
      const targetId = node.kind === "verb_argument" && node.value ? node.value.id : node.id;
      onApplyDerive(targetId, op as DeriveOperation);
    }
  };

  return (
    <div
      className={`rounded-md border p-2 ${isActive ? "border-brand-400 bg-brand-50/40" : "border-brand-100 bg-white"}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDropDerive}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="text-left"
          onClick={() =>
            onSelectNode(node.kind === "verb_argument" && node.value ? node.value.id : node.id)
          }
          title="Selecionar este nó"
        >
          <p className="text-sm font-semibold text-slate-800">{nodeLabel(node)}</p>
          {nodeSubtitle(node) ? <p className="text-xs text-slate-500">{nodeSubtitle(node)}</p> : null}
        </button>
        <button type="button" className="text-xs text-red-700 underline" onClick={() => onRemove(node.id)}>
          Remover
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {node.kind === "compound" ? (
          <Button type="button" variant="ghost" onClick={() => onPending({ kind: "compound", targetId: node.id })}>
            Adicionar raiz aqui
          </Button>
        ) : null}
        {!isVerbArgument ? (
          <>
            <Button type="button" variant="ghost" onClick={() => onPending({ kind: "combine", targetId: node.id })}>
              Combinar
            </Button>
            <Button type="button" variant="ghost" onClick={() => onPending({ kind: "possessor", targetId: node.id })}>
              Adicionar possuidor
            </Button>
            <Button type="button" variant="ghost" onClick={() => onPending({ kind: "modifier", targetId: node.id })}>
              Adicionar modificador
            </Button>
            <Button type="button" variant="ghost" onClick={() => onPending({ kind: "postposition", targetId: node.id })}>
              Adicionar pós-posição
            </Button>
          </>
        ) : null}
        {node.kind === "derive" && node.child.kind === "derive" ? (
          <Button type="button" variant="ghost" onClick={() => onSwapDerive(node.id)}>
            Inverter derivação
          </Button>
        ) : null}
        {node.kind === "derive" && DERIVE_OPERATIONS[node.operation].needsAgent && !node.agent ? (
          <Button type="button" variant="ghost" onClick={() => onPending({ kind: "derive-agent", targetId: node.id })}>
            Definir agente
          </Button>
        ) : null}
        {node.kind === "verb_frame" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onPending({ kind: "verb-subject", targetId: node.subject?.id ?? node.id })}
            >
              Definir sujeito
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onPending({ kind: "verb-object", targetId: node.object?.id ?? node.id })}
            >
              Definir objeto
            </Button>
          </>
        ) : null}
        {node.kind === "verb_argument" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onPending({
                kind: node.role === "subject" ? "verb-subject" : "verb-object",
                targetId: node.id,
              })
            }
          >
            Definir {node.role === "subject" ? "sujeito" : "objeto"}
          </Button>
        ) : null}
      </div>

      {node.kind === "compound" ? (
        <div className="mt-3 space-y-2">
          {node.children.map((child, index) => (
            <div
              key={child.id}
              className="rounded-md border border-slate-100 bg-slate-50 p-2"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("compoundId", node.id);
                event.dataTransfer.setData("fromIndex", String(index));
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const compoundId = event.dataTransfer.getData("compoundId");
                const fromIndexRaw = event.dataTransfer.getData("fromIndex");
                if (compoundId !== node.id) return;
                const fromIndex = Number(fromIndexRaw);
                if (Number.isNaN(fromIndex)) return;
                onMoveChild(node.id, fromIndex, index);
              }}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span>Parte {index + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="cursor-grab text-[11px] text-slate-400">arraste</span>
                  <button
                    type="button"
                    className="text-[11px] text-brand-700"
                    onClick={() => onMoveChild(node.id, index, index - 1)}
                    disabled={index === 0}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-brand-700"
                    onClick={() => onMoveChild(node.id, index, index + 1)}
                    disabled={index === node.children.length - 1}
                  >
                    Descer
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <NodeEditor
                  node={child}
                  onApplyDerive={onApplyDerive}
                  onRemove={onRemove}
                  onPending={onPending}
                  onMoveChild={onMoveChild}
                  onQuickPostposition={onQuickPostposition}
                  onSwapDerive={onSwapDerive}
                  activeNodeId={activeNodeId}
                  onSelectNode={onSelectNode}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {node.kind === "verb_frame" ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
            <p className="text-[11px] font-semibold text-slate-600">Verbo</p>
            <div className="mt-2">
              <NodeEditor
                node={node.verb}
                onApplyDerive={onApplyDerive}
                onRemove={onRemove}
                onPending={onPending}
                onMoveChild={onMoveChild}
                onQuickPostposition={onQuickPostposition}
                onSwapDerive={onSwapDerive}
                activeNodeId={activeNodeId}
                onSelectNode={onSelectNode}
              />
            </div>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
            <p className="text-[11px] font-semibold text-slate-600">Sujeito</p>
            {node.subject ? (
              <div className="mt-2">
                <NodeEditor
                  node={node.subject}
                  onApplyDerive={onApplyDerive}
                  onRemove={onRemove}
                  onPending={onPending}
                  onMoveChild={onMoveChild}
                  onQuickPostposition={onQuickPostposition}
                  onSwapDerive={onSwapDerive}
                  activeNodeId={activeNodeId}
                  onSelectNode={onSelectNode}
                />
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">Sujeito não definido.</p>
            )}
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
            <p className="text-[11px] font-semibold text-slate-600">Objeto</p>
            {node.object ? (
              <div className="mt-2">
                <NodeEditor
                  node={node.object}
                  onApplyDerive={onApplyDerive}
                  onRemove={onRemove}
                  onPending={onPending}
                  onMoveChild={onMoveChild}
                  onQuickPostposition={onQuickPostposition}
                  onSwapDerive={onSwapDerive}
                  activeNodeId={activeNodeId}
                  onSelectNode={onSelectNode}
                />
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">Objeto não definido.</p>
            )}
          </div>
        </div>
      ) : null}

      {node.kind === "verb_argument" && !node.value ? (
        <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-white/70 p-2 text-[11px] text-slate-500">
          Sem raiz definida para este argumento.
        </div>
      ) : null}

      {node.kind === "postposition" ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {POSTPOSITION_OPTIONS.map((postposition) => (
            <button
              key={postposition.value}
              type="button"
              className="rounded-full border border-brand-200 px-2 py-0.5 text-[11px] text-brand-800"
              onClick={() => onQuickPostposition(node.id, postposition.value)}
            >
              {postposition.value}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function nodeLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "root":
      return node.headword;
    case "compound":
      return `Compósito (${node.children.length})`;
    case "derive":
      return `${DERIVE_OPERATIONS[node.operation].token} — ${DERIVE_OPERATIONS[node.operation].note}`;
    case "postposition":
      return `Pós-posição: ${node.postposition}`;
    case "possessor":
      return "Possuidor";
    case "modifier":
      return "Modificador";
    case "verb_frame":
      return "Predicado verbal";
    case "verb_argument":
      return node.role === "subject" ? "Sujeito" : "Objeto";
    default:
      return "";
  }
}

function nodeSubtitle(node: BuilderNode): string | undefined {
  if (node.kind === "root") {
    const label = node.posLabel ? (node.posAssumed ? `${node.posLabel} (assumido)` : node.posLabel) : undefined;
    const posTag = node.posAbbrev ? `(${node.posAbbrev})` : undefined;
    const pieces = [node.gloss, posTag, label].filter(Boolean);
    return pieces.length > 0 ? pieces.join(" · ") : node.type || undefined;
  }
  if (node.kind === "derive" && node.agent) {
    return `agente: ${describeNode(node.agent)}`;
  }
  if (node.kind === "verb_frame") {
    return `verbo: ${describeNode(node.verb)}`;
  }
  if (node.kind === "verb_argument") {
    if (node.status === "omitted") return "omitido";
    if (node.status === "unspecified") return "a definir";
    if (node.value) return describeNode(node.value);
    return "explícito";
  }
  return undefined;
}

function StructuredTree({ node, depth }: { node: ReturnType<typeof toDisplayNode>; depth: number }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2" style={{ marginLeft: depth * 12 }}>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
          {node.title}
        </span>
        {node.subtitle ? <span className="text-[11px] text-slate-500">{node.subtitle}</span> : null}
      </div>
      {node.children ? (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <StructuredTree key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function findNode(node: BuilderNode, targetId: string): BuilderNode | null {
  if (node.id === targetId) return node;
  switch (node.kind) {
    case "compound":
      for (const child of node.children) {
        const found = findNode(child, targetId);
        if (found) return found;
      }
      return null;
    case "derive":
      return findNode(node.child, targetId) || (node.agent ? findNode(node.agent, targetId) : null);
    case "postposition":
      return findNode(node.child, targetId);
    case "possessor":
      return findNode(node.possessor, targetId) || findNode(node.possessed, targetId);
    case "modifier":
      return findNode(node.modifier, targetId) || findNode(node.target, targetId);
    case "verb_frame":
      return (
        findNode(node.verb, targetId) ||
        (node.subject ? findNode(node.subject, targetId) : null) ||
        (node.object ? findNode(node.object, targetId) : null)
      );
    case "verb_argument":
      return node.value ? findNode(node.value, targetId) : null;
    default:
      return null;
  }
}
