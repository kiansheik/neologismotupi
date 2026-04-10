import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";

const GITHUB_URL =
  (import.meta.env.VITE_GITHUB_URL as string | undefined)?.trim() ||
  "https://github.com/kiansheik/neologismotupi";
const CONTACT_EMAIL = "ksheik@usp.br";
const WHATSAPP_GROUP_URL = (
  import.meta.env.VITE_WHATSAPP_GROUP_URL as string | undefined
)?.trim();

export function AboutPage() {
  const { locale, t } = useI18n();
  const appName = import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi";

  useSeo({
    title: `${t("about.title")} | ${appName}`,
    description: t("about.seoDescription"),
    canonicalPath: "/about",
    locale,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: `${t("about.title")} | ${appName}`,
      description: t("about.seoDescription"),
      url: buildAbsoluteUrl("/about"),
      inLanguage: locale === "en-US" ? "en-US" : "pt-BR",
      isPartOf: {
        "@type": "WebSite",
        name: appName,
        url: buildAbsoluteUrl("/"),
      },
      creator: {
        "@type": "Person",
        name: "Kian Sheik",
      },
    },
  });

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("about.heading")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("about.p1")}</p>
        <p className="mt-2 text-sm text-slate-700">{t("about.p2")}</p>
        <p className="mt-2 text-sm text-slate-700">{t("about.p3")}</p>
        <blockquote className="mt-4 rounded-md border-l-4 border-brand-400 bg-brand-50/40 px-3 py-2 text-sm text-brand-900">
          <p className="italic">&ldquo;{t("about.motto.quote")}&rdquo;</p>
          <p className="mt-1 text-xs text-slate-600">{t("about.motto.author")}</p>
        </blockquote>
        <p className="mt-3 text-sm text-slate-700">{t("about.p4")}</p>
        <p className="mt-2 text-sm font-medium text-brand-900">{t("about.p5")}</p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("about.fundingTitle")}</h2>
        <p className="mt-2 text-sm text-slate-700">{t("about.fundingBody")}</p>
        <p className="mt-2 text-sm text-slate-700">
          {t("about.contactPrefix")}{" "}
          <a className="text-brand-700 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-2 text-sm text-slate-700">{t("about.opensourceBody")}</p>
        <p className="mt-2 text-sm">
          <a
            className="font-medium text-brand-700 hover:underline"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t("about.githubCta")}
          </a>
        </p>
      </Card>

      {WHATSAPP_GROUP_URL ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">{t("about.communityTitle")}</h2>
          <p className="mt-2 text-sm text-slate-700">{t("about.communityBody")}</p>
          <p className="mt-2 text-sm">
            <a
              className="inline-flex items-center gap-2 font-medium text-brand-700 hover:underline"
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">💬</span>
              <span>{t("about.whatsappCta")}</span>
            </a>
          </p>
        </Card>
      ) : null}
    </section>
  );
}
