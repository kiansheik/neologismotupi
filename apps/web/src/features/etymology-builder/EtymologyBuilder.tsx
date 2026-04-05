import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useEtymologyBuilderStore } from "./builder-store";
import { ModeSwitcher } from "./ModeSwitcher";
import type { BuilderMode } from "./ModeSwitcher";
import { ProModeEditor } from "./ProModeEditor";
import { SimplePipelineBuilder } from "./SimplePipelineBuilder";

type EtymologyBuilderProps = {
  onNoteChange: (note: string) => void;
  onApplyNote: (note: string) => void;
  isManualOverride: boolean;
  onApplyHeadword: (headword: string) => void;
  onApplyPartOfSpeech: (value: string) => void;
};

export function EtymologyBuilder({
  onNoteChange,
  onApplyNote,
  isManualOverride,
  onApplyHeadword,
  onApplyPartOfSpeech,
}: EtymologyBuilderProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<BuilderMode>("simple");
  const store = useEtymologyBuilderStore();

  useEffect(() => {
    onNoteChange(store.generatedNote);
  }, [store.generatedNote, onNoteChange]);

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
        <div className="mt-3 space-y-4">
          <ModeSwitcher mode={mode} onChange={setMode} />
          {mode === "simple" ? (
            <SimplePipelineBuilder
              store={store}
              onApplyNote={onApplyNote}
              isManualOverride={isManualOverride}
              onApplyHeadword={onApplyHeadword}
              onApplyPartOfSpeech={onApplyPartOfSpeech}
            />
          ) : null}
          {mode === "pro" ? (
            <ProModeEditor
              store={store}
              onApplyNote={onApplyNote}
              isManualOverride={isManualOverride}
              onApplyHeadword={onApplyHeadword}
              onApplyPartOfSpeech={onApplyPartOfSpeech}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
