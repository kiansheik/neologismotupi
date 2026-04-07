import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { OrthographyMapItem } from "@/lib/types";

const STORAGE_KEY = "nheenga.orthography.map";
const STORAGE_KEY_MODE = "nheenga.orthography.mode";

type OrthoMode = "navarro" | "personal";

interface OrthographyContextValue {
  mapping: OrthographyMapItem[];
  setMapping: (next: OrthographyMapItem[]) => void;
  orthoMode: OrthoMode;
  setOrthoMode: (mode: OrthoMode) => void;
  apply: (value: string) => string;
}

const OrthographyContext = createContext<OrthographyContextValue | null>(null);

function normalizeMapping(mapping: OrthographyMapItem[]): OrthographyMapItem[] {
  return mapping
    .map((item) => ({
      from: item.from.trim(),
      to: (item.to ?? "").trim(),
    }))
    .filter((item) => item.from.length > 0);
}

export function areMappingsEqual(a: OrthographyMapItem[], b: OrthographyMapItem[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index].from !== b[index].from || a[index].to !== b[index].to) {
      return false;
    }
  }
  return true;
}

function readStoredMapping(): OrthographyMapItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeMapping(
      parsed.map((item) => ({
        from: typeof item?.from === "string" ? item.from : "",
        to: typeof item?.to === "string" ? item.to : "",
      })),
    );
  } catch {
    return [];
  }
}

function writeStoredMapping(mapping: OrthographyMapItem[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    // Ignore storage errors.
  }
}

function readStoredMode(): OrthoMode {
  if (typeof window === "undefined") {
    return "navarro";
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MODE);
    return raw === "personal" ? "personal" : "navarro";
  } catch {
    return "navarro";
  }
}

function writeStoredMode(mode: OrthoMode) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY_MODE, mode);
  } catch {
    // Ignore storage errors.
  }
}

export function applyOrthography(value: string, mapping: OrthographyMapItem[]): string {
  if (!mapping.length) {
    return value;
  }
  let next = value;
  for (const item of mapping) {
    if (!item.from) {
      continue;
    }
    next = next.split(item.from).join(item.to ?? "");
  }
  return next;
}

export function OrthographyProvider({ children }: PropsWithChildren) {
  const [mapping, setMappingState] = useState<OrthographyMapItem[]>(() => readStoredMapping());
  const [orthoMode, setOrthoModeState] = useState<OrthoMode>(() => readStoredMode());

  const setMapping = useCallback((next: OrthographyMapItem[]) => {
    const normalized = normalizeMapping(next);
    setMappingState((current) => {
      if (areMappingsEqual(current, normalized)) {
        return current;
      }
      return normalized;
    });
    writeStoredMapping(normalized);
  }, []);

  const setOrthoMode = useCallback((mode: OrthoMode) => {
    setOrthoModeState(mode);
    writeStoredMode(mode);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setMappingState(readStoredMapping());
      } else if (event.key === STORAGE_KEY_MODE) {
        setOrthoModeState(readStoredMode());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const apply = useCallback(
    (value: string) => (orthoMode === "personal" ? applyOrthography(value, mapping) : value),
    [mapping, orthoMode],
  );
  const value = useMemo<OrthographyContextValue>(
    () => ({ mapping, setMapping, orthoMode, setOrthoMode, apply }),
    [mapping, setMapping, orthoMode, setOrthoMode, apply],
  );

  return <OrthographyContext.Provider value={value}>{children}</OrthographyContext.Provider>;
}

export function useOrthography(): OrthographyContextValue {
  const context = useContext(OrthographyContext);
  if (!context) {
    throw new Error("useOrthography must be used inside OrthographyProvider");
  }
  return context;
}

export function normalizeOrthographyMapping(mapping: OrthographyMapItem[]): OrthographyMapItem[] {
  return normalizeMapping(mapping);
}
