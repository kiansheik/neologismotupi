import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { getPublicUser } from "@/features/auth/api";
import { listEntries } from "@/features/entries/api";
import { useI18n } from "@/i18n";

export function ProfilePage() {
  const { t } = useI18n();
  const { userId } = useParams();

  const userQuery = useQuery({
    queryKey: ["public-user", userId],
    queryFn: () => getPublicUser(String(userId)),
    enabled: Boolean(userId),
  });

  const entriesQuery = useQuery({
    queryKey: ["user-entries", userId],
    queryFn: () => listEntries({ page: 1, page_size: 50, proposer_user_id: String(userId), sort: "recent" }),
    enabled: Boolean(userId),
  });

  if (!userId) {
    return <p className="text-sm text-red-700">{t("profile.invalidUrl")}</p>;
  }

  if (userQuery.isLoading) {
    return <p className="text-sm text-slate-700">{t("profile.loading")}</p>;
  }

  if (userQuery.error || !userQuery.data) {
    return <p className="text-sm text-red-700">{t("profile.loadError")}</p>;
  }

  const profile = userQuery.data.profile;

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{profile.display_name}</h1>
        {profile.role_label ? <p className="mt-1 text-sm text-slate-700">{profile.role_label}</p> : null}
        {profile.affiliation_label ? (
          <p className="text-sm text-slate-700">{profile.affiliation_label}</p>
        ) : null}
        {profile.bio ? <p className="mt-2 text-sm text-slate-700">{profile.bio}</p> : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("profile.submissionsTitle")}</h2>
        <div className="mt-3 space-y-2">
          {entriesQuery.data?.items.length ? (
            entriesQuery.data.items.map((entry) => (
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
            <p className="text-sm text-slate-600">{t("profile.noSubmissions")}</p>
          )}
        </div>
      </Card>
    </section>
  );
}
