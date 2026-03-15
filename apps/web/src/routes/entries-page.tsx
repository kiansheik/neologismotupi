import { useLocation } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { useI18n } from "@/i18n";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";

export function EntriesPage() {
  const { t, locale } = useI18n();
  const location = useLocation();

  const canonicalPath =
    location.pathname === "/entries" ? "/" : location.pathname;
  useSeo({
    title: `Dicionário vivo de Tupi moderno | ${import.meta.env.VITE_APP_NAME ?? "Nheenga Neologismos"}`,
    description:
      "Busque e compare verbetes de Tupi moderno, com glosa, etimologia, exemplos de uso e validação comunitária.",
    canonicalPath,
    locale,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Verbetes de Tupi moderno",
      url: buildAbsoluteUrl(canonicalPath),
      inLanguage: "pt-BR",
      about: {
        "@type": "Language",
        name: "Tupi",
      },
    },
  });

  return (
    <section className="space-y-4">
      <EntryBrowser
        analyticsContext="entries_page"
        queryKey="entries-global"
        titleAs="h1"
        title={t("entries.title")}
        description="Base comunitária de Tupi moderno para quem quer aprender, usar e revitalizar a língua no dia a dia."
        initialSort="recent"
      />
    </section>
  );
}
