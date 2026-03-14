import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { listEntries } from "@/features/entries/api";
import { useI18n } from "@/i18n";

export function MePage() {
  const { t } = useI18n();
  const { data: currentUser } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["my-entries"],
    queryFn: () => listEntries({ page: 1, page_size: 50, mine: true, sort: "recent" }),
    enabled: Boolean(currentUser),
  });

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("me.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("me.signInPrompt")}</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("me.title")}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>{currentUser.profile?.display_name ?? t("me.fallbackUser")}</span>
          <UserBadge
            displayName={currentUser.profile?.display_name}
            badges={currentUser.profile?.badges}
          />
          <span>· {currentUser.email}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t("reputation.label", { score: currentUser.profile?.reputation_score ?? 0 })}
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("me.submissionsTitle")}</h2>
        <div className="mt-3 space-y-2">
          {data?.items.length ? (
            data.items.map((entry) => (
              <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link className="text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                    {entry.headword}
                  </Link>
                  <StatusBadge status={entry.status} />
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">{t("me.noSubmissions")}</p>
          )}
        </div>
      </Card>
    </section>
  );
}
