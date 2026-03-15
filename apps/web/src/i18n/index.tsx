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

function resolveInitialLocale(): Locale {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "pt-BR" || saved === "en-US" || saved === "tupi-BR") {
    return saved;
  }
  return "pt-BR";
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }
  return output;
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === "tupi-BR" ? "pt-BR" : locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = dictionaries[locale];
    const t: TranslateFn = (key, vars) => {
      const message = dictionary[key];
      if (!vars) {
        return message;
      }
      return interpolate(message, vars);
    };
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
