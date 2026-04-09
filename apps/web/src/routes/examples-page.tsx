import { useLocation } from "react-router-dom";

import { BrowseTabs } from "@/components/browse-tabs";
import { ExampleBrowser } from "@/components/example-browser";
import { useI18n } from "@/i18n";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";

export function ExamplesPage() {
  const { t, locale } = useI18n();
  const location = useLocation();

  const canonicalPath = location.pathname;
  useSeo({
    title: `${t("examples.title")} | ${import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}`,
    description: t("examples.description"),
    canonicalPath,
    locale,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Exemplos de uso em Tupi",
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
      <BrowseTabs />
      <ExampleBrowser
        analyticsContext="examples_page"
        queryKey="examples-global"
        titleAs="h1"
        title={t("examples.title")}
        description={t("examples.description")}
      />
    </section>
  );
}
