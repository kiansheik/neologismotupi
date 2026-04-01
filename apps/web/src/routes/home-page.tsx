import { Link } from "react-router-dom";

import { EntryBrowser } from "@/components/entry-browser";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import { useI18n } from "@/i18n";

export function HomePage() {
  const { t } = useI18n();
  const { data: currentUser } = useCurrentUser();

  return (
    <section className="space-y-6">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">
          {t("home.title")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">
          {t("home.subtitle")}
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            className="rounded-md bg-brand-700 px-4 py-2 text-sm text-white"
            to="/entries"
          >
            {t("home.browse")}
          </Link>
          <Link
            className="rounded-md bg-white px-4 py-2 text-sm text-brand-800 ring-1 ring-brand-300"
            to="/submit"
          >
            {t("home.submit")}
          </Link>
        </div>
      </Card>

      <EntryBrowser
        compact
        queryKey="home-entries"
        title={t("home.recent")}
        emptyMessage={t("home.noEntries")}
        initialSort="recent"
        allowUnseenFilter={Boolean(currentUser)}
      />
    </section>
  );
}
