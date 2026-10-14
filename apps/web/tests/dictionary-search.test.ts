import { buildSearchIndex, searchDictionary } from "@/features/etymology-builder/dictionary-search";
import { normalizeExact, normalizeNoAccent } from "@/features/etymology-builder/orthography";
import { loadNavarroCache, searchNavarroCache } from "@/features/navarro/cache";
import { applyOrthography, normalizeOrthographyMapping } from "@/lib/orthography";

vi.mock("@/features/navarro/api", () => ({
  fetchNavarroCache: vi.fn().mockResolvedValue([
    { id: "food", first_word: "tembi’u", optional_number: "", definition: "comida" },
    { id: "pronoun", first_word: "a'e", optional_number: "", definition: "pronome" },
    { id: "verb", first_word: "e‘õ’ar", optional_number: "", definition: "verbo" },
  ]),
}));

const index = buildSearchIndex([
  { first_word: "tembi'u", definition: "comida" },
  { first_word: "a’e", definition: "pronome" },
  { first_word: "e'õ'ar", definition: "verbo" },
  { first_word: "other", definition: "remissão: tembi‘u" },
]);

describe("dictionary apostrophe equivalence", () => {
  it.each(["tembi’u", "a‘e", "eʼõʼar", "tembi＇u"])(
    "finds exact headword matches for %s",
    (query) => {
      const results = searchDictionary(index, query);
      expect(results[0].exact_match).toBe(true);
      expect(normalizeExact(results[0].first_word)).toBe(normalizeExact(query));
    },
  );

  it("matches definitions and preserves accent-insensitive lookup", () => {
    expect(searchDictionary(index, "tembi’u").map((entry) => entry.first_word)).toContain("other");
    expect(searchDictionary(index, "e‘o’ar")[0].first_word).toBe("e'õ'ar");
    expect(normalizeNoAccent("e‘õ’ar")).toBe("e'o'ar");
  });

  it("searches the Navarro cache with canonical and mobile apostrophes", async () => {
    const entries = await loadNavarroCache();
    expect(searchNavarroCache(entries, "tembi'u")[0].id).toBe("food");
    expect(searchNavarroCache(entries, "a’e")[0].id).toBe("pronoun");
    expect(searchNavarroCache(entries, "eʼõʼar")[0].id).toBe("verb");
  });

  it("uses the same apostrophe for personal orthography substitutions", () => {
    expect(applyOrthography("a’e", [{ from: "'", to: "k" }])).toBe("ake");
    expect(applyOrthography("a’e", [])).toBe("a'e");
    expect(normalizeOrthographyMapping([{ from: "‘", to: "’" }])).toEqual([{ from: "'", to: "'" }]);
  });
});
