import { normalizeExact, normalizeNoAccent } from "./orthography";

const DICT_PATH = "/etymology/dict-conjugated.json";
const NEO_PATH = "/etymology/neologisms.csv";

export type DictionaryEntry = {
  first_word: string;
  optional_number?: string;
  definition?: string;
  con?: string;
  is_tupi_portuguese?: boolean;
  type?: string;
};

export type SearchIndexEntry = {
  item: DictionaryEntry;
  firstWordExact: string;
  firstWordNoAccent: string;
  definitionLower: string;
  definitionNoAccent: string;
};

export type SearchResult = DictionaryEntry & {
  exact_match: boolean;
};

let cachedIndex: Promise<SearchIndexEntry[]> | null = null;

export async function loadDictionaryIndex(): Promise<SearchIndexEntry[]> {
  if (cachedIndex) return cachedIndex;
  cachedIndex = (async () => {
    const [dictData, neoRows] = await Promise.all([
      fetchCompressedJSON(DICT_PATH),
      fetchCSV(NEO_PATH),
    ]);
    const dictionaryEntries = mapCompressedData(dictData);
    const neoEntries = buildNeoJSON(neoRows);
    return buildSearchIndex([...dictionaryEntries, ...neoEntries]);
  })();
  return cachedIndex;
}

export function buildSearchIndex(entries: DictionaryEntry[]): SearchIndexEntry[] {
  return entries.map((item) => ({
    item,
    firstWordExact: normalizeExact(item.first_word || ""),
    firstWordNoAccent: normalizeNoAccent(item.first_word || ""),
    definitionLower: (item.definition || "").toLowerCase(),
    definitionNoAccent: normalizeNoAccent(item.definition || ""),
  }));
}

export function searchDictionary(entries: SearchIndexEntry[], query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const queryLower = trimmed.toLowerCase();

  const verbeteResultsExact = searchByFirstWord(entries, trimmed);
  const defResultsExact = searchAllDefinitions(entries, queryLower);
  const verbeteResultsIn = searchInFirstWord(entries, trimmed);

  const verbeteResultsDiacritic = searchByFirstWordNoAccent(entries, trimmed);
  const defResultsDiacritic = searchAllDefinitionsNoAccent(entries, trimmed);
  const defResultsNoBounds = searchAllDefinitionsNoBounds(entries, trimmed);

  const combinedEntries = [
    ...verbeteResultsExact,
    ...verbeteResultsDiacritic,
    ...defResultsExact,
    ...verbeteResultsIn,
    ...defResultsDiacritic,
    ...defResultsNoBounds,
  ];

  const exactKeySet = new Set([
    ...verbeteResultsExact,
    ...defResultsExact,
  ].map((entry) => keyForItem(entry.item)));

  const seenKeys = new Set<string>();
  const results: SearchResult[] = [];

  combinedEntries.forEach((entry) => {
    const key = keyForItem(entry.item);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push({
        ...entry.item,
        exact_match: exactKeySet.has(key),
      });
    }
  });

  return results;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchByFirstWord(entries: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const queryNorm = normalizeExact(query);
  return entries.filter((entry) => entry.firstWordExact === queryNorm);
}

function searchInFirstWord(entries: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const queryNorm = normalizeExact(query);
  return entries.filter((entry) => entry.firstWordExact.includes(queryNorm));
}

function searchAllDefinitions(entries: SearchIndexEntry[], queryLower: string): SearchIndexEntry[] {
  const escapedQuery = escapeRegExp(queryLower);
  const regex = new RegExp(`(^|[\\s.,;:!?()\"])${escapedQuery}($|[\\s.,;:!?()\"])`, "i");
  const filtered = entries.filter(
    (entry) => entry.item.first_word.toLowerCase() !== queryLower && regex.test(entry.definitionLower),
  );
  filtered.sort((a, b) => a.definitionLower.indexOf(queryLower) - b.definitionLower.indexOf(queryLower));
  return filtered;
}

function searchByFirstWordNoAccent(entries: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const queryNorm = normalizeNoAccent(query);
  return entries.filter((entry) => entry.firstWordNoAccent === queryNorm);
}

function searchAllDefinitionsNoAccent(entries: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const queryNorm = normalizeNoAccent(query);
  const escapedQuery = escapeRegExp(queryNorm);
  const regex = new RegExp(`(^|[\\s.,;:!?()\"])${escapedQuery}($|[\\s.,;:!?()\"])`, "i");
  const filtered = entries.filter(
    (entry) => entry.firstWordNoAccent !== queryNorm && regex.test(entry.definitionNoAccent),
  );
  filtered.sort(
    (a, b) => a.definitionNoAccent.indexOf(queryNorm) - b.definitionNoAccent.indexOf(queryNorm),
  );
  return filtered;
}

function searchAllDefinitionsNoBounds(entries: SearchIndexEntry[], query: string): SearchIndexEntry[] {
  const queryNorm = normalizeNoAccent(query);
  const escapedQuery = escapeRegExp(queryNorm);
  const regex = new RegExp(escapedQuery, "i");
  const filtered = entries.filter(
    (entry) => entry.firstWordNoAccent !== queryNorm && regex.test(entry.definitionNoAccent),
  );
  filtered.sort(
    (a, b) => a.definitionNoAccent.indexOf(queryNorm) - b.definitionNoAccent.indexOf(queryNorm),
  );
  return filtered;
}

function keyForItem(item: DictionaryEntry): string {
  return `${item.first_word}||${item.definition || ""}`;
}

async function fetchCSV(path: string): Promise<Record<string, string>[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}: ${response.status}`);
  }
  const text = await response.text();
  return parseCsvWithHeader(text);
}

async function fetchCompressedJSON(path: string): Promise<any[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  let text: string;
  if (isGzip) {
    text = await gunzipToText(buffer);
  } else {
    text = new TextDecoder().decode(buffer);
  }

  return JSON.parse(text);
}

async function gunzipToText(buffer: ArrayBuffer): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Seu navegador não suporta descompressão gzip. Use a versão não comprimida do dicionário.");
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function mapCompressedData(data: Array<Record<string, any>>): DictionaryEntry[] {
  return data.map((item) => ({
    first_word: item.f || "",
    optional_number: item.o || "",
    definition: item.d || "",
    con: item.c || "",
    is_tupi_portuguese: item.t === 1 || item.t === true,
    type: "dict",
  }));
}

function buildNeoJSON(rows: Array<Record<string, string>>): DictionaryEntry[] {
  const jsonDataList: DictionaryEntry[] = [];

  rows.forEach((row) => {
    const firstWord = row["Verbete"] || "";
    if (!firstWord) return;
    let pluriforme = row["Pluriforme"] || "";
    if (pluriforme === "Nenhuma") {
      pluriforme = "";
    }

    const categoria = (row["Categoria Gramatical"] || "").toLowerCase();
    let transitividade = row["Transitividade"] || "";

    if (transitividade === "intr.-estativo (adjetivos, substantivos)") {
      if (categoria.includes("subs") || categoria.includes("noun")) {
        transitividade = "(s.)";
      } else if (categoria.includes("adv")) {
        transitividade = "(adv.)";
      } else {
        transitividade = "(xe) (v. da 2ª classe)";
      }
    } else if (transitividade === "tr.-activo") {
      transitividade = "(v.tr.)";
    } else if (transitividade === "intr.-activo") {
      transitividade = "(v. intr.)";
    } else {
      transitividade = "";
    }

    let verbeteBase = row["Verbete(s) Base(s)"] || "";
    if (verbeteBase) {
      verbeteBase = `(etim. - ${verbeteBase})`;
    }

    const traducaoPt = row["Tradução Portuguesa"] ? `- ${row["Tradução Portuguesa"]}` : "";
    const traducaoEn = row["Tradução Inglesa"] ? `- ${row["Tradução Inglesa"]}` : "";
    const englishDefinition = row["English Definition"] ? `| ${row["English Definition"]}` : "";

    const definitionRaw = `${pluriforme} ${transitividade} ${verbeteBase} - ${row["Definição Portuguesa"] || ""} ${englishDefinition} | ${row["Atestação"] || ""} ${traducaoPt} ${traducaoEn} (${row["Fonte"] || ""}, ${row["Data da Fonte"] || ""}, ${row["Pagina(s) na Fonte"] || ""}) - neologismo`;
    const definition = definitionRaw.replace(/\s{2,}/g, " ").trim();

    jsonDataList.push({
      first_word: firstWord,
      optional_number: "",
      con: "",
      definition,
      type: "neo",
    });
  });

  return jsonDataList;
}

function parseCsvWithHeader(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const item: Record<string, string> = {};
      header.forEach((key, index) => {
        item[key] = row[index] ?? "";
      });
      return item;
    });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  const normalized = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && normalized[i + 1] === "\n") {
        i += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}
