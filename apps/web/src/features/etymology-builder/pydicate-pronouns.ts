import type { RootEntry } from "./builder-types";

type PronounOption = {
  id: string;
  label: string;
  description?: string;
  entry: RootEntry;
};

export type PronounGroup = {
  label: string;
  options: PronounOption[];
};

const base = (id: string, label: string, description?: string): PronounOption => ({
  id,
  label,
  description,
  entry: {
    headword: id,
    posKind: "pronoun",
    posAbbrev: "pron.",
    posLabel: "pronome",
    posAssumed: false,
    type: "pydicate_pronoun",
    rawDefinition: description,
    pydicateLiteral: id,
  },
});

export const PRONOUN_GROUPS: PronounGroup[] = [
  {
    label: "Pessoais",
    options: [
      base("ixé", "ixé", "1ª pessoa sing."),
      base("xe", "xe", "1ª pessoa sing. (clítico)"),
      base("îandé", "îandé", "1ª pessoa pl. inclusiva"),
      base("oré", "oré", "1ª pessoa pl. exclusiva"),
      base("endé", "endé", "2ª pessoa sing."),
      base("nde", "nde", "2ª pessoa sing. (clítico)"),
      base("pee", "pee", "2ª pessoa pl."),
      base("ae", "ae", "3ª pessoa"),
    ],
  },
  {
    label: "Sujeito explícito",
    options: [
      base("ixé_suj", "ixé_suj", "1ps (sujeito)"),
      base("xe_suj", "xe_suj", "1ps (sujeito)"),
      base("îandé_suj", "îandé_suj", "1ppi (sujeito)"),
      base("oré_suj", "oré_suj", "1ppe (sujeito)"),
      base("endé_suj", "endé_suj", "2ps (sujeito)"),
      base("nde_suj", "nde_suj", "2ps (sujeito)"),
      base("pee_suj", "pee_suj", "2pp (sujeito)"),
      base("ae_suj", "ae_suj", "3p (sujeito)"),
    ],
  },
  {
    label: "Objeto explícito",
    options: [
      base("ixé_obj", "ixé_obj", "1ps (objeto)"),
      base("xe_obj", "xe_obj", "1ps (objeto)"),
      base("îandé_obj", "îandé_obj", "1ppi (objeto)"),
      base("oré_obj", "oré_obj", "1ppe (objeto)"),
      base("endé_obj", "endé_obj", "2ps (objeto)"),
      base("nde_obj", "nde_obj", "2ps (objeto)"),
      base("pee_obj", "pee_obj", "2pp (objeto)"),
      base("ae_obj", "ae_obj", "3p (objeto)"),
    ],
  },
  {
    label: "Outros",
    options: [
      base("moro", "moro", "gente em geral"),
      base("îe", "îe", "reflexivo (a si mesmo)"),
      base("îo", "îo", "recíproco (um ao outro)"),
      base("og", "og", "sujeito da oração principal"),
      base("o_prefix", "o_prefix", "prefixo de sujeito 3p"),
      {
        id: "asé",
        label: "asé",
        description: "nós (pessoas em geral)",
        entry: {
          headword: "asé",
          posKind: "noun",
          posAbbrev: "s.",
          posLabel: "substantivo",
          posAssumed: false,
          type: "pydicate_pronoun",
          rawDefinition: "nós (pessoas em geral)",
          pydicateLiteral: "asé",
        },
      },
    ],
  },
];
