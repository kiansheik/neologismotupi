import type { RootPosKind } from "./pos";

export type DeriveOperationSpec = {
  label: string;
  token: string;
  note: string;
  pydicate?: string;
  needsAgent?: boolean;
};

export const DERIVE_OPERATIONS: Record<string, DeriveOperationSpec> = {
  agent_sara: {
    label: "Agente (sara)",
    token: "sara",
    note: "agente",
  },
  agent_bae: {
    label: "Agente (ba'e)",
    token: "ba'e",
    pydicate: "bae",
    note: "agente",
  },
  patient_pyra: {
    label: "Paciente (pyra)",
    token: "pyra",
    note: "paciente (sem agente)",
  },
  patient_emi: {
    label: "Paciente (emi) com agente",
    token: "emi",
    note: "paciente (agente explícito)",
    needsAgent: true,
  },
  basic_a: {
    label: "Nominalizador básico (-a)",
    token: "a",
    note: "ação / substantivo",
    pydicate: "a",
  },
  circumstantial_saba: {
    label: "Circunstancial (saba)",
    token: "saba",
    note: "circunstancial",
  },
  future_rama: {
    label: "Futuro (rama)",
    token: "rama",
    note: "futuro",
  },
  past_puera: {
    label: "Passado (pûera)",
    token: "pûera",
    note: "passado",
    pydicate: "pûera",
  },
  deadverbal_nduara: {
    label: "Deadverbal (ndûara)",
    token: "ndûara",
    note: "adjetivo de adv.",
    pydicate: "nduara",
  },
  causative_mo: {
    label: "Causativo (mo)",
    token: "mo",
    note: "causativo",
  },
  causative_ero: {
    label: "Causativo (ero)",
    token: "ero",
    note: "causativo (companhia/meio)",
  },
};

export type DeriveOperation = keyof typeof DERIVE_OPERATIONS;

export type RootEntry = {
  headword: string;
  gloss?: string;
  posAbbrev?: string;
  posLabel?: string;
  posKind?: RootPosKind;
  posAssumed?: boolean;
  canonical?: string;
  sourceId?: string;
  orthVariants?: string[];
  type?: string;
  rawDefinition?: string;
  pydicateLiteral?: string;
};

export type ObjectResolutionMode =
  | "open"
  | "generic_nonhuman"
  | "generic_human"
  | "root"
  | "manual";

export type ObjectResolution = {
  mode: ObjectResolutionMode;
  entry?: RootEntry;
};

export type PipelineStep =
  | { id: string; kind: "compose"; entry: RootEntry | null }
  | { id: string; kind: "derive"; op: DeriveOperation; agent?: RootEntry | null }
  | { id: string; kind: "object"; resolution: ObjectResolution };

export type PipelineState = {
  base: RootEntry | null;
  steps: PipelineStep[];
  transitivityOverride?: "transitive" | "intransitive" | null;
};

export const POSTPOSITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "amo", label: "amo (translacional)" },
  { value: "supé", label: "supé (dativo)" },
  { value: "pe", label: "pe (locativo)" },
  { value: "eme", label: "eme (temporal)" },
  { value: "iré", label: "iré (além/depois)" },
  { value: "iremen", label: "iremen (logo após)" },
  { value: "pupé", label: "pupé" },
  { value: "suí", label: "suí" },
  { value: "sosé", label: "sosé" },
  { value: "koty", label: "koty" },
  { value: "obaké", label: "obaké" },
  { value: "enondé", label: "enondé" },
  { value: "posé", label: "posé" },
  { value: "ndi", label: "ndi" },
  { value: "ndibé", label: "ndibé" },
  { value: "bé", label: "bé" },
  { value: "esé", label: "esé" },
  { value: "ri", label: "ri" },
  { value: "upi", label: "upi" },
  { value: "porupi", label: "porupi" },
  { value: "îabé", label: "îabé" },
  { value: "îá", label: "îá" },
];

export const COMMON_POSTPOSITIONS = POSTPOSITION_OPTIONS.map((option) => option.value);
