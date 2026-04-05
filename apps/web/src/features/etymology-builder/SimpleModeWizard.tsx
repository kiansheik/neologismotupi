import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { BuilderStore } from "./builder-store";
import { createId, createRootNode } from "./builder-state";
import type { BuilderNode, DeriveOperation, RootEntry, VerbArgumentNode, VerbFrameNode } from "./builder-types";
import { DERIVE_OPERATIONS } from "./builder-types";
import { RootPicker } from "./RootPicker";
import { usePyodideRuntime } from "./pyodide-runtime";
import { extractVerbeteFromOutput } from "./runtime-output";

type BuilderMode = "simple" | "advanced" | "pro";

type SimpleModeWizardProps = {
  store: BuilderStore;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
  onSwitchMode: (mode: BuilderMode) => void;
  onApplyHeadword: (headword: string) => void;
};

type SimpleCategory = "noun" | "verb" | "expression";
type NounKind = "compound" | "derived" | "loan" | "extension" | "unsure";
type VerbKind = "intransitive" | "transitive" | "reflexive" | "causative" | "unsure";
type ExpressionKind = "fixed" | "compositional" | "complex";

type SimpleStage =
  | "category"
  | "noun-kind"
  | "noun-compound"
  | "noun-compound-relation"
  | "noun-derived-root"
  | "noun-derived-type"
  | "noun-derived-options"
  | "noun-loan"
  | "noun-loan-detail"
  | "noun-extension"
  | "noun-extension-detail"
  | "verb-kind"
  | "verb-base"
  | "verb-arguments"
  | "verb-options"
  | "expression-kind"
  | "expression-detail"
  | "preview";

export function SimpleModeWizard({
  store,
  onApplyNote,
  isManualOverride,
  onSwitchMode,
  onApplyHeadword,
}: SimpleModeWizardProps) {
  const [category, setCategory] = useState<SimpleCategory>("noun");
  const [stage, setStage] = useState<SimpleStage>("category");
  const [history, setHistory] = useState<SimpleStage[]>([]);

  const [nounKind, setNounKind] = useState<NounKind>("compound");
  const [verbKind, setVerbKind] = useState<VerbKind>("intransitive");
  const [expressionKind, setExpressionKind] = useState<ExpressionKind>("fixed");

  const [compoundRoots, setCompoundRoots] = useState<Array<RootEntry | null>>([null, null, null]);
  const [compoundRelation, setCompoundRelation] = useState<"descriptive" | "related" | "place" | "combine">("combine");

  const [derivedRoot, setDerivedRoot] = useState<RootEntry | null>(null);
  const [derivedOperation, setDerivedOperation] = useState<DeriveOperation>("agent_sara");
  const [derivedAgent, setDerivedAgent] = useState<RootEntry | null>(null);
  const [derivedObject, setDerivedObject] = useState<RootEntry | null>(null);
  const [derivedPossessor, setDerivedPossessor] = useState<RootEntry | null>(null);
  const [derivedModifier, setDerivedModifier] = useState<RootEntry | null>(null);

  const [loanSource, setLoanSource] = useState("");
  const [loanType, setLoanType] = useState<"adaptation" | "calque">("adaptation");
  const [loanAdapted, setLoanAdapted] = useState("");
  const [loanNote, setLoanNote] = useState("");
  const [loanCalqueRoots, setLoanCalqueRoots] = useState<Array<RootEntry | null>>([null, null, null]);

  const [extensionRoot, setExtensionRoot] = useState<RootEntry | null>(null);
  const [extensionNote, setExtensionNote] = useState("");
  const [extensionExtraRoot, setExtensionExtraRoot] = useState<RootEntry | null>(null);

  const [verbRoot, setVerbRoot] = useState<RootEntry | null>(null);
  const [verbSubjectChoice, setVerbSubjectChoice] = useState<"show" | "omit" | "advanced">("advanced");
  const [verbObjectChoice, setVerbObjectChoice] = useState<"show" | "omit" | "advanced">("advanced");
  const [verbSubjectRoot, setVerbSubjectRoot] = useState<RootEntry | null>(null);
  const [verbObjectRoot, setVerbObjectRoot] = useState<RootEntry | null>(null);
  const [verbAddCausative, setVerbAddCausative] = useState(false);
  const [verbAddPostposition, setVerbAddPostposition] = useState(false);
  const [verbPostposition, setVerbPostposition] = useState("amo");

  const [expressionText, setExpressionText] = useState("");
  const [expressionNote, setExpressionNote] = useState("");
  const [expressionRoots, setExpressionRoots] = useState<Array<RootEntry | null>>([null, null, null]);
  const [expressionRelation, setExpressionRelation] = useState<"descriptive" | "related" | "combine">("combine");
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);

  const steps = useMemo<SimpleStage[]>(() => {
    if (category === "noun") {
      if (nounKind === "compound") {
        return ["category", "noun-kind", "noun-compound", "noun-compound-relation", "preview"];
      }
      if (nounKind === "derived") {
        return ["category", "noun-kind", "noun-derived-root", "noun-derived-type", "noun-derived-options", "preview"];
      }
      if (nounKind === "loan") {
        return ["category", "noun-kind", "noun-loan", "noun-loan-detail", "preview"];
      }
      if (nounKind === "extension") {
        return ["category", "noun-kind", "noun-extension", "noun-extension-detail", "preview"];
      }
      return ["category", "noun-kind", "preview"];
    }
    if (category === "verb") {
      return ["category", "verb-kind", "verb-base", "verb-arguments", "verb-options", "preview"];
    }
    return ["category", "expression-kind", "expression-detail", "preview"];
  }, [category, nounKind, verbKind, expressionKind]);

  const stepIndex = steps.indexOf(stage) >= 0 ? steps.indexOf(stage) + 1 : 1;

  const recipeItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    const rootLabel = (entry?: RootEntry | null) => entry?.headword || "—";
    const relationLabel = (relation: "descriptive" | "related" | "place" | "combine") =>
      relation === "descriptive"
        ? "descritivo"
        : relation === "related"
          ? "relacionado a"
          : relation === "place"
            ? "lugar / instrumento"
            : "combinar";
    const expressionRelationLabel = (relation: "descriptive" | "related" | "combine") =>
      relation === "descriptive" ? "descritivo" : relation === "related" ? "relacionado a" : "combinar";
    const verbChoiceLabel = (
      choice: "show" | "omit" | "advanced",
      root: RootEntry | null,
    ) => {
      if (choice === "omit") return "omitido";
      if (choice === "advanced") return "decidir depois";
      return root ? `explícito: ${root.headword}` : "explícito";
    };

    if (category === "noun") {
      const kindLabel =
        nounKind === "compound"
          ? "compósito"
          : nounKind === "derived"
            ? "derivado"
            : nounKind === "loan"
              ? "empréstimo"
              : nounKind === "extension"
                ? "extensão"
                : "indefinido";
      items.push({ label: "Tipo", value: `Substantivo — ${kindLabel}` });
      if (nounKind === "compound") {
        items.push({ label: "Raiz 1", value: rootLabel(compoundRoots[0]) });
        items.push({ label: "Raiz 2", value: rootLabel(compoundRoots[1]) });
        items.push({ label: "Raiz 3", value: rootLabel(compoundRoots[2]) });
        items.push({ label: "Relação", value: relationLabel(compoundRelation) });
      } else if (nounKind === "derived") {
        const op = DERIVE_OPERATIONS[derivedOperation];
        items.push({ label: "Base", value: rootLabel(derivedRoot) });
        items.push({ label: "Derivação", value: `${op.token} — ${op.note}` });
        if (derivedRoot?.posKind === "verb_tr") {
          items.push({ label: "Objeto do verbo", value: rootLabel(derivedObject) });
        }
        if (op.needsAgent) {
          items.push({ label: "Agente", value: rootLabel(derivedAgent) });
        }
        items.push({ label: "Possuidor", value: rootLabel(derivedPossessor) });
        items.push({ label: "Modificador", value: rootLabel(derivedModifier) });
      } else if (nounKind === "loan") {
        items.push({ label: "Origem", value: loanSource || "—" });
        items.push({ label: "Tipo", value: loanType === "calque" ? "calque" : "adaptação" });
        if (loanType === "calque") {
          items.push({ label: "Raiz 1", value: rootLabel(loanCalqueRoots[0]) });
          items.push({ label: "Raiz 2", value: rootLabel(loanCalqueRoots[1]) });
          items.push({ label: "Raiz 3", value: rootLabel(loanCalqueRoots[2]) });
        } else {
          items.push({ label: "Forma adaptada", value: loanAdapted || "—" });
        }
      } else if (nounKind === "extension") {
        items.push({ label: "Base", value: rootLabel(extensionRoot) });
        items.push({ label: "Nota", value: extensionNote || "—" });
        items.push({ label: "Modificador", value: rootLabel(extensionExtraRoot) });
      }
    } else if (category === "verb") {
      const kindLabel =
        verbKind === "intransitive"
          ? "intransitivo"
          : verbKind === "transitive"
            ? "transitivo"
            : verbKind === "reflexive"
              ? "reflexivo"
              : verbKind === "causative"
                ? "causativo"
                : "indefinido";
      items.push({ label: "Tipo", value: `Verbo — ${kindLabel}` });
      items.push({ label: "Base", value: rootLabel(verbRoot) });
      items.push({ label: "Sujeito", value: verbChoiceLabel(verbSubjectChoice, verbSubjectRoot) });
      if (verbKind === "transitive") {
        items.push({ label: "Objeto", value: verbChoiceLabel(verbObjectChoice, verbObjectRoot) });
      }
      items.push({ label: "Causativo", value: verbAddCausative ? "sim" : "não" });
      items.push({ label: "Pós-posição", value: verbAddPostposition ? verbPostposition : "—" });
    } else if (category === "expression") {
      const kindLabel =
        expressionKind === "fixed" ? "fixa" : expressionKind === "compositional" ? "composicional" : "complexa";
      items.push({ label: "Tipo", value: `Expressão — ${kindLabel}` });
      if (expressionKind === "fixed") {
        items.push({ label: "Forma", value: expressionText || "—" });
        items.push({ label: "Nota", value: expressionNote || "—" });
      } else {
        items.push({ label: "Raiz 1", value: rootLabel(expressionRoots[0]) });
        items.push({ label: "Raiz 2", value: rootLabel(expressionRoots[1]) });
        items.push({ label: "Raiz 3", value: rootLabel(expressionRoots[2]) });
        items.push({ label: "Relação", value: expressionRelationLabel(expressionRelation) });
        if (expressionKind === "complex") {
          items.push({ label: "Texto base", value: expressionText || "—" });
        }
        if (expressionNote) {
          items.push({ label: "Nota", value: expressionNote });
        }
      }
    }

    return items;
  }, [
    category,
    nounKind,
    verbKind,
    expressionKind,
    compoundRoots,
    compoundRelation,
    derivedRoot,
    derivedOperation,
    derivedAgent,
    derivedObject,
    derivedPossessor,
    derivedModifier,
    loanSource,
    loanType,
    loanAdapted,
    loanCalqueRoots,
    extensionRoot,
    extensionNote,
    extensionExtraRoot,
    verbRoot,
    verbSubjectChoice,
    verbObjectChoice,
    verbSubjectRoot,
    verbObjectRoot,
    verbAddCausative,
    verbAddPostposition,
    verbPostposition,
    expressionText,
    expressionNote,
    expressionRoots,
    expressionRelation,
  ]);

  const summaryContent = stage === "category" ? null : <RecipeSummary items={recipeItems} />;

  const expressionReady =
    expressionKind === "fixed"
      ? expressionText.trim().length > 0
      : Boolean(expressionRoots[0] || (expressionKind === "complex" && expressionText.trim().length > 0));

  const derivedNeedsObject = derivedRoot?.posKind === "verb_tr";
  const derivedReady = !derivedNeedsObject || Boolean(derivedObject);

  const { state: runtimeState, iframeProps } = usePyodideRuntime(
    store.pydicatePreview,
    runtimeEnabled && stage === "preview",
  );
  const runtimeVerbete = extractVerbeteFromOutput(runtimeState.output);

  useEffect(() => {
    if (!steps.includes(stage)) {
      setStage(steps[0]);
      setHistory([]);
    }
  }, [steps, stage]);

  useEffect(() => {
    if (stage !== "preview") return;
    const { tree, focusId } = buildTree();
    store.setRootAndFocus(tree, focusId ?? null);
  }, [
    stage,
    category,
    nounKind,
    verbKind,
    expressionKind,
    compoundRoots,
    compoundRelation,
    derivedRoot,
    derivedOperation,
    derivedAgent,
    derivedObject,
    derivedPossessor,
    derivedModifier,
    loanSource,
    loanType,
    loanAdapted,
    loanNote,
    loanCalqueRoots,
    extensionRoot,
    extensionNote,
    extensionExtraRoot,
    verbRoot,
    verbSubjectChoice,
    verbObjectChoice,
    verbSubjectRoot,
    verbObjectRoot,
    verbAddCausative,
    verbAddPostposition,
    verbPostposition,
    expressionText,
    expressionNote,
    expressionRoots,
    expressionRelation,
    store,
  ]);

  const goNext = (next: SimpleStage) => {
    setHistory((prev) => [...prev, stage]);
    setStage(next);
  };

  const goBack = () => {
    setHistory((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      if (last) setStage(last);
      return next;
    });
  };

  const buildTree = (): { tree: BuilderNode | null; focusId?: string | null } => {
    if (category === "noun") {
      if (nounKind === "compound") {
        const [r1, r2, r3] = compoundRoots;
        if (!r1) return { tree: null, focusId: null };
        const root1 = createRootNode(r1);
        if (!r2) return { tree: root1, focusId: root1.id };
        const root2 = createRootNode(r2);
        if (compoundRelation === "descriptive" && !r3) {
          const modifierNode: BuilderNode = {
            id: createId("modifier"),
            kind: "modifier",
            modifier: root1,
            target: root2,
          };
          return { tree: modifierNode, focusId: modifierNode.id };
        }
        if (compoundRelation === "related" && !r3) {
          const possessorNode: BuilderNode = {
            id: createId("possessor"),
            kind: "possessor",
            possessor: root2,
            possessed: root1,
          };
          return { tree: possessorNode, focusId: possessorNode.id };
        }
        const baseCompound: BuilderNode = {
          id: createId("compound"),
          kind: "compound",
          children: [root1, root2, ...(r3 ? [createRootNode(r3)] : [])],
        };
        if (compoundRelation === "place") {
          const deriveNode: BuilderNode = {
            id: createId("derive"),
            kind: "derive",
            operation: "circumstantial_saba",
            child: baseCompound,
          };
          return { tree: deriveNode, focusId: deriveNode.id };
        }
        return { tree: baseCompound, focusId: baseCompound.id };
      }
      if (nounKind === "derived") {
        if (!derivedRoot) return { tree: null, focusId: null };
        const baseRoot = createRootNode(derivedRoot);
        let derivedChild: BuilderNode = baseRoot;
        if (derivedRoot.posKind === "verb_tr") {
          if (!derivedObject) return { tree: null, focusId: null };
          const objectNode: VerbArgumentNode = {
            id: createId("verb_object"),
            kind: "verb_argument",
            role: "object",
            status: "explicit",
            value: createRootNode(derivedObject),
          };
          const frame: VerbFrameNode = {
            id: createId("verb_frame"),
            kind: "verb_frame",
            verb: baseRoot,
            object: objectNode,
          };
          derivedChild = frame;
        }
        const deriveNode: BuilderNode = {
          id: createId("derive"),
          kind: "derive",
          operation: derivedOperation,
          child: derivedChild,
          agent: derivedAgent ? createRootNode(derivedAgent) : undefined,
        };
        const deriveFocusId = deriveNode.id;
        let current: BuilderNode = deriveNode;
        if (derivedPossessor) {
          current = {
            id: createId("possessor"),
            kind: "possessor",
            possessor: createRootNode(derivedPossessor),
            possessed: current,
          };
        }
        if (derivedModifier) {
          current = {
            id: createId("modifier"),
            kind: "modifier",
            modifier: createRootNode(derivedModifier),
            target: current,
          };
        }
        return { tree: current, focusId: deriveFocusId };
      }
      if (nounKind === "loan") {
        if (!loanSource.trim()) return { tree: null, focusId: null };
        if (loanType === "calque") {
          const [r1, r2, r3] = loanCalqueRoots;
          if (!r1) return { tree: null, focusId: null };
          const compound: BuilderNode = {
            id: createId("compound"),
            kind: "compound",
            children: [createRootNode(r1), ...(r2 ? [createRootNode(r2)] : []), ...(r3 ? [createRootNode(r3)] : [])],
          };
          return { tree: compound, focusId: compound.id };
        }
        const base = loanAdapted.trim() || loanSource.trim();
        const manual = createRootNode({
          headword: base,
          gloss: loanNote.trim() ? `${loanNote.trim()} (empréstimo de ${loanSource.trim()})` : `empréstimo de ${loanSource.trim()}`,
          type: "manual",
        });
        return { tree: manual, focusId: manual.id };
      }
      if (nounKind === "extension") {
        if (!extensionRoot) return { tree: null, focusId: null };
        const baseRoot = createRootNode({
          ...extensionRoot,
          gloss: extensionNote.trim()
            ? `${extensionRoot.gloss ?? ""} → ${extensionNote.trim()}`.trim()
            : extensionRoot.gloss,
        });
        const baseFocusId = baseRoot.id;
        if (extensionExtraRoot) {
          const modifierNode: BuilderNode = {
            id: createId("modifier"),
            kind: "modifier",
            modifier: createRootNode(extensionExtraRoot),
            target: baseRoot,
          };
          return { tree: modifierNode, focusId: baseFocusId };
        }
        return { tree: baseRoot, focusId: baseFocusId };
      }
      return { tree: null, focusId: null };
    }

    if (category === "verb") {
      if (!verbRoot) return { tree: null, focusId: null };
      let verbNode: BuilderNode = createRootNode(verbRoot);
      if (verbAddCausative) {
        verbNode = {
          id: createId("derive"),
          kind: "derive",
          operation: "causative_mo",
          child: verbNode,
        };
      }
      if (verbAddPostposition) {
        verbNode = {
          id: createId("postposition"),
          kind: "postposition",
          postposition: verbPostposition,
          child: verbNode,
        };
      }
      const subjectNode: VerbArgumentNode = {
        id: createId("verb_subject"),
        kind: "verb_argument",
        role: "subject",
        status: verbSubjectChoice === "show" ? "explicit" : verbSubjectChoice === "omit" ? "omitted" : "unspecified",
        value: verbSubjectChoice === "show" && verbSubjectRoot ? createRootNode(verbSubjectRoot) : undefined,
      };
      const objectNode: VerbArgumentNode | undefined =
        verbKind === "transitive"
          ? {
              id: createId("verb_object"),
              kind: "verb_argument",
              role: "object",
              status: verbObjectChoice === "show" ? "explicit" : verbObjectChoice === "omit" ? "omitted" : "unspecified",
              value: verbObjectChoice === "show" && verbObjectRoot ? createRootNode(verbObjectRoot) : undefined,
            }
          : undefined;
      const frame: VerbFrameNode = {
        id: createId("verb_frame"),
        kind: "verb_frame",
        verb: verbNode,
        subject: subjectNode,
        object: objectNode,
      };
      return { tree: frame, focusId: frame.id };
    }

    if (category === "expression") {
      if (expressionKind === "fixed") {
        if (!expressionText.trim()) return { tree: null, focusId: null };
        const manual = createRootNode({
          headword: expressionText.trim(),
          gloss: expressionNote.trim() || undefined,
          type: "manual",
        });
        return { tree: manual, focusId: manual.id };
      }

      const [r1, r2, r3] = expressionRoots;
      if (r1) {
        const root1 = createRootNode(r1);
        if (!r2) {
          return { tree: root1, focusId: root1.id };
        }
        const root2 = createRootNode(r2);
        if (expressionRelation === "descriptive" && !r3) {
          const modifierNode: BuilderNode = {
            id: createId("modifier"),
            kind: "modifier",
            modifier: root1,
            target: root2,
          };
          return { tree: modifierNode, focusId: modifierNode.id };
        }
        if (expressionRelation === "related" && !r3) {
          const possessorNode: BuilderNode = {
            id: createId("possessor"),
            kind: "possessor",
            possessor: root2,
            possessed: root1,
          };
          return { tree: possessorNode, focusId: possessorNode.id };
        }
        const compoundNode: BuilderNode = {
          id: createId("compound"),
          kind: "compound",
          children: [root1, root2, ...(r3 ? [createRootNode(r3)] : [])],
        };
        return { tree: compoundNode, focusId: compoundNode.id };
      }

      if (expressionKind === "complex" && expressionText.trim()) {
        const manual = createRootNode({
          headword: expressionText.trim(),
          gloss: expressionNote.trim() || undefined,
          type: "manual",
        });
        return { tree: manual, focusId: manual.id };
      }

      return { tree: null, focusId: null };
    }

    return { tree: null, focusId: null };
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand-900">Modo simples</p>
          <p className="text-xs text-slate-600">Passo {stepIndex} de {steps.length}</p>
        </div>
        {history.length > 0 ? (
          <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={goBack}>
            Voltar
          </button>
        ) : null}
      </div>

      {stage === "category" ? (
        <StepCard summary={summaryContent} title="O que você está criando?">
          <OptionGrid>
            <OptionButton active={category === "noun"} onClick={() => setCategory("noun")}>
              Substantivo
            </OptionButton>
            <OptionButton active={category === "verb"} onClick={() => setCategory("verb")}>
              Verbo
            </OptionButton>
            <OptionButton active={category === "expression"} onClick={() => setCategory("expression")}>
              Expressão
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext(category === "noun" ? "noun-kind" : category === "verb" ? "verb-kind" : "expression-kind")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-kind" ? (
        <StepCard summary={summaryContent} title="Que tipo de substantivo?">
          <OptionGrid>
            <OptionButton active={nounKind === "compound"} onClick={() => setNounKind("compound")}>
              Compósito de raízes
            </OptionButton>
            <OptionButton active={nounKind === "derived"} onClick={() => setNounKind("derived")}>
              Derivado de verbo
            </OptionButton>
            <OptionButton active={nounKind === "loan"} onClick={() => setNounKind("loan")}>
              Empréstimo / adaptação
            </OptionButton>
            <OptionButton active={nounKind === "extension"} onClick={() => setNounKind("extension")}>
              Extensão semântica
            </OptionButton>
            <OptionButton active={nounKind === "unsure"} onClick={() => setNounKind("unsure")}>
              Não tenho certeza
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext(nounKind === "compound" ? "noun-compound" : nounKind === "derived" ? "noun-derived-root" : nounKind === "loan" ? "noun-loan" : nounKind === "extension" ? "noun-extension" : "preview")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-compound" ? (
        <StepCard summary={summaryContent} title="Escolha as raízes do compósito">
          <div className="grid gap-3">
            <RootPicker label="Primeira raiz" value={compoundRoots[0]} onChange={(entry) => updateRootAt(0, entry, setCompoundRoots)} />
            <RootPicker label="Segunda raiz" value={compoundRoots[1]} onChange={(entry) => updateRootAt(1, entry, setCompoundRoots)} />
            <RootPicker label="Terceira raiz (opcional)" value={compoundRoots[2]} onChange={(entry) => updateRootAt(2, entry, setCompoundRoots)} />
          </div>
          <StepActions>
            <Button
              type="button"
              onClick={() => goNext("noun-compound-relation")}
              disabled={!compoundRoots[0] || !compoundRoots[1]}
            >
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-compound-relation" ? (
        <StepCard summary={summaryContent} title="Como as raízes se relacionam?">
          <OptionGrid>
            <OptionButton active={compoundRelation === "descriptive"} onClick={() => setCompoundRelation("descriptive")}>
              Compósito descritivo
            </OptionButton>
            <OptionButton active={compoundRelation === "related"} onClick={() => setCompoundRelation("related")}>
              Coisa relacionada a X
            </OptionButton>
            <OptionButton active={compoundRelation === "place"} onClick={() => setCompoundRelation("place")}>
              Lugar / instrumento
            </OptionButton>
            <OptionButton active={compoundRelation === "combine"} onClick={() => setCompoundRelation("combine")}>
              Apenas combinar
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext("preview")}>
              Ver prévia
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-derived-root" ? (
        <StepCard summary={summaryContent} title="Escolha o verbo de base">
          <RootPicker label="Verbo base" value={derivedRoot} onChange={setDerivedRoot} />
          <StepActions>
            <Button type="button" onClick={() => goNext("noun-derived-type")} disabled={!derivedRoot}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-derived-type" ? (
        <StepCard summary={summaryContent} title="Que tipo de substantivo derivado?">
          <OptionGrid>
            <OptionButton active={derivedOperation === "agent_sara"} onClick={() => setDerivedOperation("agent_sara")}>
              Fazedor / agente
              <OptionHint>({DERIVE_OPERATIONS.agent_sara.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "patient_pyra"} onClick={() => setDerivedOperation("patient_pyra")}>
              Paciente / afetado
              <OptionHint>({DERIVE_OPERATIONS.patient_pyra.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "patient_emi"} onClick={() => setDerivedOperation("patient_emi")}>
              Paciente com agente
              <OptionHint>({DERIVE_OPERATIONS.patient_emi.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "circumstantial_saba"} onClick={() => setDerivedOperation("circumstantial_saba")}>
              Lugar / modo / causa
              <OptionHint>({DERIVE_OPERATIONS.circumstantial_saba.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "basic_a"} onClick={() => setDerivedOperation("basic_a")}>
              Ação / evento
              <OptionHint>({DERIVE_OPERATIONS.basic_a.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "future_rama"} onClick={() => setDerivedOperation("future_rama")}>
              Futuro / intencionado
              <OptionHint>({DERIVE_OPERATIONS.future_rama.token})</OptionHint>
            </OptionButton>
            <OptionButton active={derivedOperation === "past_puera"} onClick={() => setDerivedOperation("past_puera")}>
              Antigo / passado
              <OptionHint>({DERIVE_OPERATIONS.past_puera.token})</OptionHint>
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext("noun-derived-options")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-derived-options" ? (
        <StepCard summary={summaryContent} title="Deseja adicionar algo mais?">
          <div className="grid gap-3">
            {derivedNeedsObject ? (
              <RootPicker
                label="Objeto do verbo (obrigatório para v.tr.)"
                value={derivedObject}
                onChange={setDerivedObject}
              />
            ) : null}
            {derivedOperation === "patient_emi" ? (
              <RootPicker label="Agente explícito (opcional)" value={derivedAgent} onChange={setDerivedAgent} />
            ) : null}
            <RootPicker label="Possuidor (opcional)" value={derivedPossessor} onChange={setDerivedPossessor} />
            <RootPicker label="Modificador (opcional)" value={derivedModifier} onChange={setDerivedModifier} />
          </div>
          <StepActions>
            <Button type="button" onClick={() => goNext("preview")} disabled={!derivedReady}>
              Ver prévia
            </Button>
            {derivedNeedsObject && !derivedObject ? (
              <p className="text-xs text-amber-700">
                Verbo transitivo precisa de objeto antes da derivação.
              </p>
            ) : null}
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-loan" ? (
        <StepCard summary={summaryContent} title="Origem do empréstimo">
          <div className="grid gap-2">
            <Input
              value={loanSource}
              onChange={(event) => setLoanSource(event.target.value)}
              placeholder="Termo de origem (ex.: português/latim)"
            />
            <div className="flex flex-wrap gap-2 text-xs">
              <OptionButton active={loanType === "adaptation"} onClick={() => setLoanType("adaptation")}>
                Adaptação
              </OptionButton>
              <OptionButton active={loanType === "calque"} onClick={() => setLoanType("calque")}>
                Calque
              </OptionButton>
            </div>
          </div>
          <StepActions>
            <Button type="button" onClick={() => goNext("noun-loan-detail")} disabled={!loanSource.trim()}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-loan-detail" ? (
        <StepCard summary={summaryContent} title={loanType === "calque" ? "Raízes do calque" : "Detalhes da adaptação"}>
          {loanType === "calque" ? (
            <div className="grid gap-3">
              <RootPicker label="Primeira raiz" value={loanCalqueRoots[0]} onChange={(entry) => updateRootAt(0, entry, setLoanCalqueRoots)} />
              <RootPicker label="Segunda raiz" value={loanCalqueRoots[1]} onChange={(entry) => updateRootAt(1, entry, setLoanCalqueRoots)} />
              <RootPicker label="Terceira raiz (opcional)" value={loanCalqueRoots[2]} onChange={(entry) => updateRootAt(2, entry, setLoanCalqueRoots)} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Input
                value={loanAdapted}
                onChange={(event) => setLoanAdapted(event.target.value)}
                placeholder="Forma adaptada (se houver)"
              />
              <Textarea
                value={loanNote}
                onChange={(event) => setLoanNote(event.target.value)}
                placeholder="Nota curta de adaptação"
              />
            </div>
          )}
          <StepActions>
            <Button
              type="button"
              onClick={() => goNext("preview")}
              disabled={loanType === "calque" ? !loanCalqueRoots[0] : false}
            >
              Ver prévia
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-extension" ? (
        <StepCard summary={summaryContent} title="Base da extensão semântica">
          <RootPicker label="Raiz base" value={extensionRoot} onChange={setExtensionRoot} />
          <StepActions>
            <Button type="button" onClick={() => goNext("noun-extension-detail")} disabled={!extensionRoot}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "noun-extension-detail" ? (
        <StepCard summary={summaryContent} title="Detalhes da extensão">
          <Textarea
            value={extensionNote}
            onChange={(event) => setExtensionNote(event.target.value)}
            placeholder="Descreva o novo sentido"
          />
          <div className="mt-3">
            <RootPicker label="Modificador extra (opcional)" value={extensionExtraRoot} onChange={setExtensionExtraRoot} />
          </div>
          <StepActions>
            <Button type="button" onClick={() => goNext("preview")}>
              Ver prévia
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "verb-kind" ? (
        <StepCard summary={summaryContent} title="Que tipo de verbo?">
          <OptionGrid>
            <OptionButton active={verbKind === "intransitive"} onClick={() => setVerbKind("intransitive")}>
              Intransitivo
            </OptionButton>
            <OptionButton active={verbKind === "transitive"} onClick={() => setVerbKind("transitive")}>
              Transitivo
            </OptionButton>
            <OptionButton active={verbKind === "reflexive"} onClick={() => setVerbKind("reflexive")}>
              Reflexivo / médio
            </OptionButton>
            <OptionButton active={verbKind === "causative"} onClick={() => setVerbKind("causative")}>
              Causativo
            </OptionButton>
            <OptionButton active={verbKind === "unsure"} onClick={() => setVerbKind("unsure")}>
              Não tenho certeza
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext("verb-base")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "verb-base" ? (
        <StepCard summary={summaryContent} title="Escolha o verbo base">
          <RootPicker label="Verbo base" value={verbRoot} onChange={setVerbRoot} />
          <StepActions>
            <Button type="button" onClick={() => goNext("verb-arguments")} disabled={!verbRoot}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "verb-arguments" ? (
        <StepCard summary={summaryContent} title="Argumentos (opcional)">
          <p className="text-xs text-slate-600">
            Ajuste os argumentos no modo avançado se precisar de controle total.
          </p>
          <div className="mt-2 grid gap-2 text-xs">
            <div>
              <p className="font-semibold text-slate-700">Sujeito</p>
              <OptionInline value={verbSubjectChoice} onChange={setVerbSubjectChoice} />
              {verbSubjectChoice === "show" ? (
                <div className="mt-2">
                  <RootPicker label="Sujeito (opcional)" value={verbSubjectRoot} onChange={setVerbSubjectRoot} />
                </div>
              ) : null}
            </div>
            {verbKind === "transitive" ? (
              <div>
                <p className="font-semibold text-slate-700">Objeto</p>
                <OptionInline value={verbObjectChoice} onChange={setVerbObjectChoice} />
                {verbObjectChoice === "show" ? (
                  <div className="mt-2">
                    <RootPicker label="Objeto (opcional)" value={verbObjectRoot} onChange={setVerbObjectRoot} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <StepActions>
            <Button type="button" onClick={() => goNext("verb-options")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "verb-options" ? (
        <StepCard summary={summaryContent} title="Adições opcionais">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={verbAddCausative}
              onChange={(event) => setVerbAddCausative(event.target.checked)}
            />
            Aplicar causativo
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="h-3 w-3"
              checked={verbAddPostposition}
              onChange={(event) => setVerbAddPostposition(event.target.checked)}
            />
            Adicionar relação pós-posicional
          </label>
          {verbAddPostposition ? (
            <div className="mt-2">
              <Input value={verbPostposition} onChange={(event) => setVerbPostposition(event.target.value)} placeholder="Pós-posição (ex.: amo)" />
            </div>
          ) : null}
          <StepActions>
            <Button type="button" onClick={() => goNext("preview")}>
              Ver prévia
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "expression-kind" ? (
        <StepCard summary={summaryContent} title="Que tipo de expressão?">
          <OptionGrid>
            <OptionButton active={expressionKind === "fixed"} onClick={() => setExpressionKind("fixed")}>
              Expressão fixa
            </OptionButton>
            <OptionButton active={expressionKind === "compositional"} onClick={() => setExpressionKind("compositional")}>
              Expressão composicional
            </OptionButton>
            <OptionButton active={expressionKind === "complex"} onClick={() => setExpressionKind("complex")}>
              Mais complexa
            </OptionButton>
          </OptionGrid>
          <StepActions>
            <Button type="button" onClick={() => goNext("expression-detail")}>
              Continuar
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "expression-detail" ? (
        <StepCard summary={summaryContent} title="Detalhes da expressão">
          {expressionKind === "fixed" ? (
            <>
              <Input
                value={expressionText}
                onChange={(event) => setExpressionText(event.target.value)}
                placeholder="Forma ou frase base"
              />
              <Textarea
                className="mt-2"
                value={expressionNote}
                onChange={(event) => setExpressionNote(event.target.value)}
                placeholder="Nota curta (opcional)"
              />
            </>
          ) : (
            <>
              <div className="grid gap-3">
                <RootPicker label="Raiz principal" value={expressionRoots[0]} onChange={(entry) => updateRootAt(0, entry, setExpressionRoots)} />
                <RootPicker label="Segunda raiz (opcional)" value={expressionRoots[1]} onChange={(entry) => updateRootAt(1, entry, setExpressionRoots)} />
                <RootPicker label="Terceira raiz (opcional)" value={expressionRoots[2]} onChange={(entry) => updateRootAt(2, entry, setExpressionRoots)} />
              </div>
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-700">Relação entre as partes</p>
                <OptionGrid>
                  <OptionButton active={expressionRelation === "descriptive"} onClick={() => setExpressionRelation("descriptive")}>
                    Descritiva
                  </OptionButton>
                  <OptionButton active={expressionRelation === "related"} onClick={() => setExpressionRelation("related")}>
                    Coisa relacionada a X
                  </OptionButton>
                  <OptionButton active={expressionRelation === "combine"} onClick={() => setExpressionRelation("combine")}>
                    Apenas combinar
                  </OptionButton>
                </OptionGrid>
              </div>
              {expressionKind === "complex" ? (
                <>
                  <Input
                    className="mt-2"
                    value={expressionText}
                    onChange={(event) => setExpressionText(event.target.value)}
                    placeholder="Texto base (opcional)"
                  />
                  <Textarea
                    className="mt-2"
                    value={expressionNote}
                    onChange={(event) => setExpressionNote(event.target.value)}
                    placeholder="Nota curta (opcional)"
                  />
                  <p className="mt-2 text-xs text-amber-700">
                    Estruturas complexas ficam melhores no modo avançado.
                  </p>
                </>
              ) : (
                <Textarea
                  className="mt-2"
                  value={expressionNote}
                  onChange={(event) => setExpressionNote(event.target.value)}
                  placeholder="Nota curta (opcional)"
                />
              )}
            </>
          )}
          <StepActions>
            <Button type="button" onClick={() => goNext("preview")} disabled={!expressionReady}>
              Ver prévia
            </Button>
          </StepActions>
        </StepCard>
      ) : null}

      {stage === "preview" ? (
        <StepCard summary={summaryContent} title="Prévia e nota gerada">
          <p className="text-xs text-slate-600">A nota abaixo é gerada a partir da estrutura criada no modo simples.</p>
          <div className="mt-2 rounded-md border border-brand-100 bg-white px-2 py-2 text-sm text-slate-800">
            {store.generatedNote || "Preencha os passos para gerar a nota."}
          </div>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
            <p className="text-[11px] font-semibold text-slate-600">Prévia pydicate (melhor esforço)</p>
            <div className="mt-1 font-mono text-[11px] text-slate-800">
              {store.pydicatePreview || "—"}
            </div>
          </div>
          <div className="mt-3 rounded-md border border-slate-200 bg-white/70 px-2 py-2 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-600">Saída do pydicate (verbete)</p>
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={runtimeEnabled}
                  onChange={(event) => setRuntimeEnabled(event.target.checked)}
                />
                Executar Pyodide
              </label>
            </div>
            <div className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-800">
              {runtimeEnabled && stage === "preview"
                ? runtimeState.output || runtimeState.message || "—"
                : "Runtime desativado."}
            </div>
            {runtimeEnabled && stage === "preview" ? (
              <div className="mt-1 text-[11px] text-slate-500">
                {runtimeState.status === "loading" ? "Carregando runtime..." : null}
                {runtimeState.status === "running" ? "Executando..." : null}
                {runtimeState.status === "error" && runtimeState.message ? runtimeState.message : null}
              </div>
            ) : null}
            {runtimeEnabled && stage === "preview" ? <iframe {...iframeProps} className="hidden" /> : null}
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => onSwitchMode("advanced")}>
              Continuar no modo avançado
            </Button>
            <Button type="button" variant="ghost" onClick={() => onSwitchMode("pro")}>
              Ir para modo Pro
            </Button>
          </div>
        </StepCard>
      ) : null}
    </div>
  );
}

function StepCard({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-brand-100 bg-white/70 p-3">
      <p className="text-sm font-semibold text-brand-900">{title}</p>
      {summary ? <div className="mt-2">{summary}</div> : null}
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function RecipeSummary({ items }: { items: Array<{ label: string; value: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-brand-100 bg-brand-50/40 p-2 text-xs">
      <p className="text-[11px] font-semibold text-brand-800">Receita atual</p>
      <div className="mt-2 grid gap-1">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">{item.label}</span>
            <span className="text-slate-800">{item.value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left text-xs ${
        active ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function OptionHint({ children }: { children: ReactNode }) {
  return <span className="ml-1 text-[11px] text-slate-500">{children}</span>;
}

function StepActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function OptionInline({
  value,
  onChange,
}: {
  value: "show" | "omit" | "advanced";
  onChange: (value: "show" | "omit" | "advanced") => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {(["show", "omit", "advanced"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full border px-3 py-1 text-[11px] ${
            value === option ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {option === "show" ? "Exibir" : option === "omit" ? "Omitir" : "Decidir depois"}
        </button>
      ))}
    </div>
  );
}

function updateRootAt(
  index: number,
  entry: RootEntry | null,
  setter: Dispatch<SetStateAction<Array<RootEntry | null>>>,
) {
  setter((current) => {
    const next = [...current];
    next[index] = entry;
    return next;
  });
}
