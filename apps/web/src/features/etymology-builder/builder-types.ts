export type DeriveOperation =
  | "agent"
  | "patient"
  | "patient_with_agent"
  | "circumstantial"
  | "future"
  | "past"
  | "causative";

export type DeriveOperationSpec = {
  label: string;
  token: string;
  note: string;
  needsAgent?: boolean;
};

export const DERIVE_OPERATIONS: Record<DeriveOperation, DeriveOperationSpec> = {
  agent: {
    label: "Fazer agente / autor",
    token: "sara",
    note: "agente / fazedor",
  },
  patient: {
    label: "Fazer paciente / afetado",
    token: "pyra",
    note: "paciente / afetado",
  },
  patient_with_agent: {
    label: "Paciente com agente explícito",
    token: "emi",
    note: "paciente com agente explícito",
    needsAgent: true,
  },
  circumstantial: {
    label: "Circunstancial (lugar/tempo/meio)",
    token: "saba",
    note: "circunstancial (lugar/tempo/meio)",
  },
  future: {
    label: "Futuro / intencionado",
    token: "rama",
    note: "futuro / intencionado",
  },
  past: {
    label: "Passado / antigo",
    token: "pûera",
    note: "passado / antigo",
  },
  causative: {
    label: "Causativo",
    token: "mo",
    note: "causativo",
  },
};

export type RootEntry = {
  headword: string;
  gloss?: string;
  pos?: string;
  canonical?: string;
  sourceId?: string;
  orthVariants?: string[];
  type?: string;
  rawDefinition?: string;
};

export type RootNode = RootEntry & {
  id: string;
  kind: "root";
};

export type CompoundNode = {
  id: string;
  kind: "compound";
  children: BuilderNode[];
};

export type DeriveNode = {
  id: string;
  kind: "derive";
  operation: DeriveOperation;
  child: BuilderNode;
  agent?: BuilderNode;
};

export type PostpositionNode = {
  id: string;
  kind: "postposition";
  postposition: string;
  child: BuilderNode;
};

export type PossessorNode = {
  id: string;
  kind: "possessor";
  possessor: BuilderNode;
  possessed: BuilderNode;
};

export type ModifierNode = {
  id: string;
  kind: "modifier";
  modifier: BuilderNode;
  target: BuilderNode;
};

export type BuilderNode =
  | RootNode
  | CompoundNode
  | DeriveNode
  | PostpositionNode
  | PossessorNode
  | ModifierNode;

export type PendingInsert =
  | { kind: "compound"; targetId?: string }
  | { kind: "combine"; targetId: string }
  | { kind: "possessor"; targetId: string }
  | { kind: "modifier"; targetId: string }
  | { kind: "postposition"; targetId: string }
  | { kind: "derive-agent"; targetId: string };

export const COMMON_POSTPOSITIONS = ["amo", "supé", "pupé", "suí", "esé", "ri"];
