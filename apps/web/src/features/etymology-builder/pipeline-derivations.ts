import { DERIVE_OPERATIONS } from "./builder-types";
import type { DeriveOperation } from "./builder-types";

export type PipelineStageKind = "verb" | "noun" | "adverb" | "other";

export type PipelineDerivationSpec = {
  op: DeriveOperation;
  label: string;
  description: string;
  token: string;
  appliesTo: PipelineStageKind[];
  resultCategory: "verb" | "noun";
  setsTransitivity?: "transitive" | "intransitive";
  needsAgent?: boolean;
};

const op = DERIVE_OPERATIONS;

export const PIPELINE_DERIVATIONS: Record<DeriveOperation, PipelineDerivationSpec> = {
  agent_sara: {
    op: "agent_sara",
    label: "Agente / fazedor",
    description: "sara",
    token: op.agent_sara.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
  },
  agent_bae: {
    op: "agent_bae",
    label: "Agente / fazedor",
    description: "ba'e",
    token: op.agent_bae.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
  },
  patient_pyra: {
    op: "patient_pyra",
    label: "Paciente / afetado",
    description: "pyra",
    token: op.patient_pyra.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
  },
  patient_emi: {
    op: "patient_emi",
    label: "Paciente com agente",
    description: "emi",
    token: op.patient_emi.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
    needsAgent: true,
  },
  basic_a: {
    op: "basic_a",
    label: "Ação / evento",
    description: "-a",
    token: op.basic_a.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
  },
  circumstantial_saba: {
    op: "circumstantial_saba",
    label: "Circunstância (lugar/modo/causa)",
    description: "saba",
    token: op.circumstantial_saba.token,
    appliesTo: ["verb"],
    resultCategory: "noun",
  },
  future_rama: {
    op: "future_rama",
    label: "Futuro / destinado",
    description: "rama",
    token: op.future_rama.token,
    appliesTo: ["noun"],
    resultCategory: "noun",
  },
  past_puera: {
    op: "past_puera",
    label: "Passado / antigo",
    description: "pûera",
    token: op.past_puera.token,
    appliesTo: ["noun"],
    resultCategory: "noun",
  },
  deadverbal_nduara: {
    op: "deadverbal_nduara",
    label: "Adj. de advérbio",
    description: "ndûara",
    token: op.deadverbal_nduara.token,
    appliesTo: ["adverb"],
    resultCategory: "noun",
  },
  causative_mo: {
    op: "causative_mo",
    label: "Causativo",
    description: "mo",
    token: op.causative_mo.token,
    appliesTo: ["verb"],
    resultCategory: "verb",
    setsTransitivity: "transitive",
  },
  causative_ero: {
    op: "causative_ero",
    label: "Causativo (companhia/meio)",
    description: "ero",
    token: op.causative_ero.token,
    appliesTo: ["verb"],
    resultCategory: "verb",
    setsTransitivity: "transitive",
  },
};

export const PIPELINE_DERIVATION_GROUPS: Array<{ label: string; ops: DeriveOperation[] }> = [
  {
    label: "Nominalizadores verbais",
    ops: ["agent_sara", "agent_bae", "patient_pyra", "patient_emi", "basic_a", "circumstantial_saba"],
  },
  {
    label: "Classificadores",
    ops: ["future_rama", "past_puera"],
  },
  {
    label: "Deadverbal",
    ops: ["deadverbal_nduara"],
  },
  {
    label: "Causativos",
    ops: ["causative_mo", "causative_ero"],
  },
];

export function getPipelineDerivation(opKey: DeriveOperation): PipelineDerivationSpec {
  return PIPELINE_DERIVATIONS[opKey];
}
