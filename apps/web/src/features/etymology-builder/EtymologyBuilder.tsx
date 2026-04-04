import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toDisplayNode } from "./builder-render";
import {
  applyPendingInsert,
  createRootNode,
  moveCompoundChild,
  removeNode,
  updatePostposition,
  wrapWithDerive,
} from "./builder-state";
import { COMMON_POSTPOSITIONS, DERIVE_OPERATIONS } from "./builder-types";
import type { BuilderNode, DeriveOperation, PendingInsert, RootEntry } from "./builder-types";
import { loadDictionaryIndex, searchDictionary } from "./dictionary-search";
import type { SearchIndexEntry, SearchResult } from "./dictionary-search";
import { describeNode, renderHumanNote } from "./note-export";
import { collectPieces, renderPydicate } from "./pydicate-preview";
import { normalizeNoAccent } from "./orthography";
import { compactDefinition, defaultPosInfo, formatPosDisplay, parsePosInfo, posInfoForKind, POS_OPTIONS } from "./pos";
import type { RootPosKind } from "./pos";
import { usePyodideRuntime } from "./pyodide-runtime";

type EtymologyBuilderProps = {
  onNoteChange: (note: string) => void;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
};

export function EtymologyBuilder({ onNoteChange, onApplyNote, isManualOverride }: EtymologyBuilderProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [root, setRoot] = useState<BuilderNode | null>(null);
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMinimized, setSearchMinimized] = useState(false);
  const [manualHeadword, setManualHeadword] = useState("");
  const [manualGloss, setManualGloss] = useState("");
  const [manualPosKind, setManualPosKind] = useState<RootPosKind>("noun");
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    loadDictionaryIndex()
      .then((index) => {
        if (!active) return;
        setSearchIndex(index);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSearchError(error instanceof Error ? error.message : "Erro ao carregar o dicionário.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (pendingInsert) {
      setSearchMinimized(false);
    }
  }, [pendingInsert]);

  useEffect(() => {
    if (!root) {
      setSearchMinimized(false);
    }
  }, [root]);

  const results = useMemo(() => {
    if (!searchIndex || searchMinimized) return [];
    return searchDictionary(searchIndex, query).slice(0, 12);
  }, [searchIndex, query, searchMinimized]);

  const generatedNote = useMemo(() => renderHumanNote(root), [root]);
  const pydicatePreview = useMemo(() => renderPydicate(root), [root]);
  const pieces = useMemo(() => collectPieces(root), [root]);
  const { state: runtimeState, iframeProps } = usePyodideRuntime(pydicatePreview, isOpen && runtimeEnabled);

  useEffect(() => {
    onNoteChange(generatedNote);
  }, [generatedNote, onNoteChange]);

  const pendingLabel = useMemo(() => {
    if (!pendingInsert) return null;
    const target = pendingInsert.targetId && root ? findNode(root, pendingInsert.targetId) : null;
    const targetLabel = target ? describeNode(target) : "";
    switch (pendingInsert.kind) {
      case "compound":
        return targetLabel ? `Adicionar raiz ao compósito de ${targetLabel}` : "Adicionar raiz ao compósito";
      case "combine":
        return targetLabel ? `Combinar com ${targetLabel}` : "Combinar com outra raiz";
      case "possessor":
        return targetLabel ? `Definir complemento de ${targetLabel}` : "Definir complemento";
      case "modifier":
        return targetLabel ? `Definir adjunto de ${targetLabel}` : "Definir adjunto";
      case "postposition":
        return targetLabel ? `Adicionar pós-posição em ${targetLabel}` : "Adicionar pós-posição";
      case "derive-agent":
        return targetLabel ? `Definir agente para ${targetLabel}` : "Definir agente";
      default:
        return "Selecionar raiz";
    }
  }, [pendingInsert, root]);

  const handlePickRoot = (entry: RootEntry) => {
    const newRoot = createRootNode(entry);
    setRoot((current) => applyPendingInsert(current, pendingInsert, newRoot));
    setPendingInsert(null);
    setQuery("");
    setSearchMinimized(true);
    setActiveNodeId((current) => current ?? newRoot.id);
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

  const handleQuickPostposition = (targetId: string, postposition: string) => {
    if (!root) return;
    setRoot((current) => (current ? updatePostposition(current, targetId, postposition) : current));
  };

  const handleApplyDerive = (targetId: string, operation: DeriveOperation) => {
    setRoot((current) => (current ? wrapWithDerive(current, targetId, operation) : current));
    setActiveNodeId(targetId);
  };

  const handleRemoveNode = (targetId: string) => {
    if (!root) return;
    const next = removeNode(root, targetId);
    setRoot(next);
    if (activeNodeId === targetId) {
      setActiveNodeId(next?.id ?? null);
    }
  };

  const handleMoveChild = (compoundId: string, fromIndex: number, toIndex: number) => {
    setRoot((current) => (current ? moveCompoundChild(current, compoundId, fromIndex, toIndex) : current));
  };

  const displayTree = root ? toDisplayNode(root) : null;
  const activeTargetId = activeNodeId ?? root?.id ?? null;
  const activeNode = activeTargetId && root ? findNode(root, activeTargetId) : null;
  const activeNodeLabel = activeNode ? nodeLabel(activeNode) : null;

  return (
    <div className="rounded-md border border-brand-200 bg-white/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-900">Construtor de etimologia (beta)</p>
          <p className="mt-1 text-xs text-slate-600">
            Monte a etimologia em etapas e gere uma nota automática sem mudar o envio.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setIsOpen((prev) => !prev)}>
          {isOpen ? "Ocultar" : "Expandir"}
        </Button>
      </div>

      {!isOpen ? null : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                      onClick={() => setPendingInsert(null)}
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
                      <ResultCard
                        key={`${result.first_word}-${result.definition}`}
                        result={result}
                        onPick={handlePickRoot}
                      />
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
                {root ? (
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => {
                      setRoot(null);
                      setActiveNodeId(null);
                    }}
                  >
                    Limpar tudo
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Clique em uma raiz para inserir. Depois, selecione um nó e use as ações para derivar, compor ou anexar.
              </p>
              <div className="mt-3 rounded-md border border-slate-200 bg-white/80 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Banco de derivação</p>
                  <p className="text-[11px] text-slate-500">
                    Foco: {activeNodeLabel || "selecione um nó"}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(DERIVE_OPERATIONS).map(([key, op]) => (
                    <button
                      key={key}
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("deriveOp", key);
                      }}
                      onClick={() => {
                        if (!activeTargetId) return;
                        handleApplyDerive(activeTargetId, key as DeriveOperation);
                      }}
                      className="rounded-full border border-brand-200 bg-white px-3 py-1 text-[11px] text-brand-900 hover:border-brand-400"
                      title={op.label}
                      disabled={!activeTargetId}
                    >
                      <span className="font-semibold">{op.token}</span>
                      <span className="text-slate-600"> — {op.note}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Arraste para um nó ou clique para aplicar ao foco atual.
                </p>
              </div>
              {!root ? (
                <div className="mt-3 rounded-md border border-dashed border-brand-200 bg-white/60 p-3 text-xs text-slate-600">
                  Comece selecionando uma raiz no painel de busca.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <NodeEditor
                    node={root}
                    onApplyDerive={handleApplyDerive}
                    onRemove={handleRemoveNode}
                    onPending={setPendingInsert}
                    onMoveChild={handleMoveChild}
                    onQuickPostposition={handleQuickPostposition}
                    activeNodeId={activeTargetId}
                    onSelectNode={setActiveNodeId}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPendingInsert({ kind: "compound" })}
                >
                  Adicionar outra raiz
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPendingInsert({ kind: "postposition", targetId: root?.id ?? "" })}
                  disabled={!root}
                >
                  Adicionar pós-posição
                </Button>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-md border border-brand-100 bg-white/70 p-3">
              <p className="text-sm font-semibold text-brand-900">Saída ao vivo</p>
              <p className="mt-1 text-xs text-slate-600">A nota abaixo é gerada pelo construtor.</p>
              <div className="mt-2 rounded-md border border-brand-100 bg-white px-2 py-2 text-sm text-slate-800">
                {generatedNote || "Construa uma raiz para gerar a nota."}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onApplyNote(generatedNote)}
                  disabled={!generatedNote}
                >
                  Usar no campo abaixo
                </Button>
                {isManualOverride ? (
                  <p className="text-xs text-amber-700">
                    Texto editado manualmente. Clique em “Usar” para sobrescrever.
                  </p>
                ) : null}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Estrutura compacta</summary>
                <div className="mt-2 space-y-1 text-xs text-slate-700">
                  {displayTree ? <StructuredTree node={displayTree} depth={0} /> : "Sem estrutura ainda."}
                </div>
              </details>

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Prévia avançada</summary>
                <p className="mt-2 text-xs text-slate-500">
                  Melhor esforço (assume substantivo quando a classe não é detectada).
                </p>
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-800">
                  {pydicatePreview || "—"}
                </div>
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
                <div className="mt-2">
                  <p className="text-xs font-semibold text-slate-700">Peças canônicas</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {pieces.length === 0 ? (
                      <span className="text-xs text-slate-500">—</span>
                    ) : (
                      pieces.map((piece, index) => (
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
              </details>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result, onPick }: { result: SearchResult; onPick: (entry: RootEntry) => void }) {
  const parsedPos = parsePosInfo(result.definition);
  const posInfo = parsedPos ?? defaultPosInfo();
  const posDisplay = formatPosDisplay(posInfo);
  const gloss = compactDefinition(result.definition);
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
          <p className="mt-1 text-xs text-slate-600">{gloss || "—"}</p>
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
          Usar
        </Button>
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
  activeNodeId,
  onSelectNode,
}: {
  node: BuilderNode;
  onApplyDerive: (targetId: string, operation: DeriveOperation) => void;
  onRemove: (targetId: string) => void;
  onPending: (pending: PendingInsert | null) => void;
  onMoveChild: (compoundId: string, fromIndex: number, toIndex: number) => void;
  onQuickPostposition: (targetId: string, postposition: string) => void;
  activeNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const isActive = activeNodeId === node.id;
  const handleDropDerive = (event: DragEvent<HTMLDivElement>) => {
    const op = event.dataTransfer.getData("deriveOp");
    if (op) {
      event.preventDefault();
      onApplyDerive(node.id, op as DeriveOperation);
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
          onClick={() => onSelectNode(node.id)}
          title="Selecionar este nó"
        >
          <p className="text-sm font-semibold text-slate-800">{nodeLabel(node)}</p>
          {nodeSubtitle(node) ? <p className="text-xs text-slate-500">{nodeSubtitle(node)}</p> : null}
        </button>
        <button
          type="button"
          className="text-xs text-red-700 underline"
          onClick={() => onRemove(node.id)}
        >
          Remover
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {node.kind === "compound" ? (
          <Button type="button" variant="ghost" onClick={() => onPending({ kind: "compound", targetId: node.id })}>
            Adicionar raiz aqui
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => onPending({ kind: "combine", targetId: node.id })}>
          Combinar
        </Button>
        <Button type="button" variant="ghost" onClick={() => onPending({ kind: "possessor", targetId: node.id })}>
          Adicionar complemento (de)
        </Button>
        <Button type="button" variant="ghost" onClick={() => onPending({ kind: "modifier", targetId: node.id })}>
          Adicionar adjunto
        </Button>
        <Button type="button" variant="ghost" onClick={() => onPending({ kind: "postposition", targetId: node.id })}>
          Adicionar pós-posição
        </Button>
        {node.kind === "derive" && node.operation === "patient_with_agent" && !node.agent ? (
          <Button type="button" variant="ghost" onClick={() => onPending({ kind: "derive-agent", targetId: node.id })}>
            Definir agente
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
                  activeNodeId={activeNodeId}
                  onSelectNode={onSelectNode}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {node.kind === "postposition" ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {COMMON_POSTPOSITIONS.map((postposition) => (
            <button
              key={postposition}
              type="button"
              className="rounded-full border border-brand-200 px-2 py-0.5 text-[11px] text-brand-800"
              onClick={() => onQuickPostposition(node.id, postposition)}
            >
              {postposition}
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
      return "Complemento (de)";
    case "modifier":
      return "Adjunto";
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
    default:
      return null;
  }
}
