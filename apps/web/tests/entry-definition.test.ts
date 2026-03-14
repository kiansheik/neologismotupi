import { describe, expect, it } from "vitest";

import { entryDefinitionPreview, splitEntryDefinition } from "@/lib/entry-definition";

describe("entry-definition parsing", () => {
  it("splits definitions by semicolon and line breaks", () => {
    const value = "Etapa; Passo\nEspaço entre os passos";
    expect(splitEntryDefinition(value)).toEqual(["Etapa", "Passo", "Espaço entre os passos"]);
  });

  it("splits sentence blocks for readability", () => {
    const value =
      "Etapa, Passo. Espaço entre os passos. (Nhe'embysasu por extensão semântica) Fonte: Protocolo Mendonça (pg. 3)";
    expect(splitEntryDefinition(value)).toEqual([
      "Etapa, Passo.",
      "Espaço entre os passos.",
      "(Nhe'embysasu por extensão semântica) Fonte: Protocolo Mendonça (pg. 3)",
    ]);
  });

  it("builds concise previews from parsed parts", () => {
    const value = "Etapa; Passo; Espaço entre os passos";
    expect(entryDefinitionPreview(value, { maxParts: 2 })).toBe("Etapa · Passo...");
  });
});

