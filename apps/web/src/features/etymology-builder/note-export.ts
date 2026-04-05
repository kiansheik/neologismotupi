import { DERIVE_OPERATIONS } from "./builder-types";
import type { PipelineState, RootEntry } from "./builder-types";
import { compactDefinition } from "./pos";

export function renderHumanNote(state: PipelineState): string {
  if (!state.base) return "";

  const segments: string[] = [];
  segments.push(`base: ${describeEntry(state.base)}`);

  if (state.steps.length > 0) {
    const ops = state.steps.map((step) => {
      if (step.kind === "compose") {
        return step.entry ? `/ ${describeEntryShort(step.entry)}` : "composição: pendente";
      }
      if (step.kind === "object") {
        if (step.resolution.mode === "open") return "obj.: em aberto";
        if (step.resolution.entry) return `obj.: ${describeEntryShort(step.resolution.entry)}`;
        return "obj.: pendente";
      }
      if (step.kind === "postposition") {
        return `posp.: ${step.value}`;
      }
      const op = DERIVE_OPERATIONS[step.op];
      const label = `${op.token} (${op.note})`;
      if (op.needsAgent && step.agent) {
        return `${label}; agente: ${describeEntryShort(step.agent)}`;
      }
      return label;
    });
    segments.push(`passos: ${ops.join(", ")}`);
  }

  return segments.join("; ");
}

function describeEntry(entry: RootEntry): string {
  const pos = entry.posAbbrev ? `(${entry.posAbbrev})` : "";
  const gloss = entry.rawDefinition ? compactDefinition(entry.rawDefinition) : entry.gloss ? compactDefinition(entry.gloss) : undefined;
  if (!gloss) return `${entry.headword} ${pos}`.trim();
  return `${entry.headword} ${pos} — ${gloss}`.trim();
}

function describeEntryShort(entry: RootEntry): string {
  return entry.headword;
}
