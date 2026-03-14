import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  approveEntry,
  approveExample,
  getModerationQueue,
  getModerationReports,
  hideExample,
  rejectEntry,
  resolveReport,
} from "@/features/moderation/api";
import { useI18n } from "@/i18n";
import { formatDateTime, reportReasonLabel, reportStatusLabel, reportTargetLabel } from "@/i18n/formatters";

export function ModerationPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { locale, t } = useI18n();

  const queueQuery = useQuery({
    queryKey: ["mod-queue"],
    queryFn: getModerationQueue,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const reportsQuery = useQuery({
    queryKey: ["mod-reports", "open"],
    queryFn: () => getModerationReports("open"),
    enabled: Boolean(currentUser?.is_superuser),
  });

  const refreshModeration = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    await queryClient.invalidateQueries({ queryKey: ["mod-reports"] });
    await queryClient.invalidateQueries({ queryKey: ["entries"] });
  };

  const approveEntryMutation = useMutation({ mutationFn: (entryId: string) => approveEntry(entryId), onSuccess: refreshModeration });
  const rejectEntryMutation = useMutation({ mutationFn: (entryId: string) => rejectEntry(entryId), onSuccess: refreshModeration });
  const approveExampleMutation = useMutation({ mutationFn: (exampleId: string) => approveExample(exampleId), onSuccess: refreshModeration });
  const hideExampleMutation = useMutation({ mutationFn: (exampleId: string) => hideExample(exampleId), onSuccess: refreshModeration });
  const resolveReportMutation = useMutation({ mutationFn: (reportId: string) => resolveReport(reportId), onSuccess: refreshModeration });

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("moderation.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("moderation.signInPrompt")}</p>
      </Card>
    );
  }

  if (!currentUser.is_superuser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("moderation.title")}</h1>
        <p className="mt-2 text-sm text-red-700">{t("moderation.noPermission")}</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("moderation.queueTitle")}</h1>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-brand-800">{t("moderation.pendingEntries")}</h2>
            <div className="mt-2 space-y-2">
              {queueQuery.data?.entries.map((entry) => (
                <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link className="font-medium text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                      {entry.headword}
                    </Link>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => approveEntryMutation.mutate(entry.id)}>
                      {t("moderation.approve")}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => rejectEntryMutation.mutate(entry.id)}>
                      {t("moderation.reject")}
                    </Button>
                  </div>
                </article>
              ))}
              {queueQuery.data?.entries.length === 0 ? (
                <p className="text-sm text-slate-600">{t("moderation.noPendingEntries")}</p>
              ) : null}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-brand-800">{t("moderation.pendingExamples")}</h2>
            <div className="mt-2 space-y-2">
              {queueQuery.data?.examples.map((example) => (
                <article key={example.id} className="rounded-md border border-brand-100 p-3">
                  <p className="text-sm text-slate-800">{example.sentence_original}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => approveExampleMutation.mutate(example.id)}>
                      {t("moderation.approve")}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => hideExampleMutation.mutate(example.id)}>
                      {t("moderation.hide")}
                    </Button>
                  </div>
                </article>
              ))}
              {queueQuery.data?.examples.length === 0 ? (
                <p className="text-sm text-slate-600">{t("moderation.noPendingExamples")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("moderation.openReports")}</h2>
        <div className="mt-3 space-y-2">
          {reportsQuery.data?.map((report) => (
            <article key={report.id} className="rounded-md border border-brand-100 p-3">
              <p className="text-sm text-slate-700">
                <span className="font-medium text-brand-900">{t("moderation.reportedContent")}:</span>{" "}
                {report.target_url ? (
                  <Link className="font-medium text-brand-800 hover:underline" to={report.target_url}>
                    {report.target_label ?? report.target_id}
                  </Link>
                ) : (
                  <span className="font-medium text-brand-800">{report.target_label ?? report.target_id}</span>
                )}{" "}
                <span className="text-slate-500">({reportTargetLabel(report.target_type, t)})</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-medium text-brand-900">{t("moderation.reportReason")}:</span>{" "}
                {report.free_text?.trim() ? report.free_text : reportReasonLabel(report.reason_code, t)}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-medium text-brand-900">{t("moderation.reportedBy")}:</span>{" "}
                <Link
                  className="font-medium text-brand-700 hover:underline"
                  to={report.reporter_profile_url ?? `/profiles/${report.reporter_user_id}`}
                >
                  {report.reporter_display_name ?? t("moderation.unknownReporter")}
                </Link>
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-medium text-brand-900">{t("moderation.reportedAt")}:</span>{" "}
                {formatDateTime(report.created_at, locale)}
              </p>
              {report.target_url ? (
                <div className="mt-1">
                  <Link className="text-sm font-medium text-brand-700 hover:underline" to={report.target_url}>
                    {t("moderation.openTarget")}
                  </Link>
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  tone={
                    report.status === "resolved"
                      ? "approved"
                      : report.status === "dismissed"
                        ? "danger"
                        : report.status === "reviewed"
                          ? "disputed"
                          : "pending"
                  }
                >
                  {reportStatusLabel(report.status, t)}
                </Badge>
                <Button type="button" onClick={() => resolveReportMutation.mutate(report.id)}>
                  {t("moderation.resolve")}
                </Button>
              </div>
            </article>
          ))}
          {reportsQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-600">{t("moderation.noOpenReports")}</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
