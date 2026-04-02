import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { enUS, ptBR, tupiBrasil, type TranslationKey } from "@/i18n/messages";

const STORAGE_KEY = "nheenga.locale";

const dictionaries = {
  "pt-BR": ptBR,
  "en-US": enUS,
  "tupi-BR": tupiBrasil,
} as const;

export type Locale = keyof typeof dictionaries;
export type TranslateFn = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return null;
  }
  return storage;
}

function resolveInitialLocale(): Locale {
  const storage = getStorage();
  if (!storage) {
    return "pt-BR";
  }
  const saved = storage.getItem(STORAGE_KEY);
  if (saved === "pt-BR" || saved === "en-US" || saved === "tupi-BR") {
    return saved;
  }
  return "pt-BR";
}

function resolveMessage(
  key: TranslationKey,
  dictionary: Record<TranslationKey, string>,
  vars?: Record<string, string | number>,
): string {
  const lookup = dictionary as Record<string, string>;

  const resolveTemplate = (template: string, visited: Set<string>): string =>
    template.replace(/\{([^}]+)\}/g, (match, token) => {
      if (vars && Object.prototype.hasOwnProperty.call(vars, token)) {
        return String(vars[token]);
      }
      const nested = lookup[token];
      if (!nested) {
        return match;
      }
      if (visited.has(token)) {
        return nested;
      }
      visited.add(token);
      return resolveTemplate(nested, visited);
    });

  const template = lookup[key] ?? key;
  return resolveTemplate(template, new Set<string>([key]));
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, locale);
    }
    document.documentElement.lang = locale === "tupi-BR" ? "pt-BR" : locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[locale];
    const t: TranslateFn = (key, vars) => resolveMessage(key, dictionary, vars);
    return {
      locale,
      setLocale: setLocaleState,
      t,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
