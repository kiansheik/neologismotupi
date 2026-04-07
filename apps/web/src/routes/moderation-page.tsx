import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  approveEntry,
  approveExample,
  getModerationDashboard,
  getModerationQueue,
  getModerationReports,
  rejectEntry,
  rejectExample,
  resolveReport,
} from "@/features/moderation/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import {
  formatBytes,
  formatDateTime,
  reportReasonLabel,
  reportStatusLabel,
  reportTargetLabel,
} from "@/i18n/formatters";

export function ModerationPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { locale, t } = useI18n();

  const queueQuery = useQuery({
    queryKey: ["mod-queue"],
    queryFn: getModerationQueue,
    enabled: Boolean(currentUser?.is_superuser),
  });
  const dashboardQuery = useQuery({
    queryKey: ["mod-dashboard"],
    queryFn: getModerationDashboard,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const reportsQuery = useQuery({
    queryKey: ["mod-reports", "open"],
    queryFn: () => getModerationReports("open"),
    enabled: Boolean(currentUser?.is_superuser),
  });

  const refreshModeration = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mod-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    await queryClient.invalidateQueries({ queryKey: ["mod-reports"] });
    await queryClient.invalidateQueries({ queryKey: ["entries"] });
  };

  const approveEntryMutation = useMutation({
    mutationFn: (entryId: string) => approveEntry(entryId),
    onSuccess: () => {
      trackEvent("moderation_entry_approved");
      return refreshModeration();
    },
    onError: (error) => {
      trackEvent("moderation_entry_approve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const rejectEntryMutation = useMutation({
    mutationFn: (params: { entryId: string; reason: string }) =>
      rejectEntry(params.entryId, { reason: params.reason }),
    onSuccess: () => {
      trackEvent("moderation_entry_rejected");
      return refreshModeration();
    },
    onError: (error) => {
      trackEvent("moderation_entry_reject_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const approveExampleMutation = useMutation({
    mutationFn: (exampleId: string) => approveExample(exampleId),
    onSuccess: () => {
      trackEvent("moderation_example_approved");
      return refreshModeration();
    },
    onError: (error) => {
      trackEvent("moderation_example_approve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const rejectExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; reason: string }) =>
      rejectExample(params.exampleId, { reason: params.reason }),
    onSuccess: () => {
      trackEvent("moderation_example_rejected");
      return refreshModeration();
    },
    onError: (error) => {
      trackEvent("moderation_example_reject_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const resolveReportMutation = useMutation({
    mutationFn: (reportId: string) => resolveReport(reportId),
    onSuccess: () => {
      trackEvent("moderation_report_resolved");
      return refreshModeration();
    },
    onError: (error) => {
      trackEvent("moderation_report_resolve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const promptRequiredReason = (promptText: string): string | null => {
    const response = window.prompt(promptText);
    if (response === null) {
      return null;
    }
    const reason = response.trim();
    if (!reason) {
      window.alert(t("moderation.reasonRequired"));
      return null;
    }
    return reason;
  };

  const hostDisk = dashboardQuery.data?.host_disk ?? null;
  const hostDiskPercent = hostDisk ? Math.max(0, Math.min(100, hostDisk.used_percent)) : null;
  const hostDiskToneClass =
    hostDiskPercent === null
      ? "bg-slate-400"
      : hostDiskPercent >= 90
        ? "bg-red-600"
        : hostDiskPercent >= 75
          ? "bg-amber-500"
          : "bg-emerald-600";

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
        <h1 className="text-xl font-semibold text-brand-900">{t("moderation.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("moderation.howto.short")}</p>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold text-brand-900">{t("moderation.queueTitle")}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-brand-800">{t("moderation.pendingEntries")}</h2>
            <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto rounded-md border border-brand-100 bg-surface/70 p-2 pr-3">
              {queueQuery.data?.entries.map((entry) => (
                <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link className="font-medium text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                      {entry.headword}
                    </Link>
                    <StatusBadge status={entry.status} showPending />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      className="px-2.5 py-1 text-xs disabled:opacity-35"
                      onClick={() => approveEntryMutation.mutate(entry.id)}
                      disabled={approveEntryMutation.isPending}
                    >
                      {approveEntryMutation.isPending ? t("moderation.approving") : t("moderation.approve")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="px-2.5 py-1 text-xs disabled:opacity-35"
                      onClick={() => {
                        const reason = promptRequiredReason(t("moderation.prompt.entryRejectReason"));
                        if (!reason) {
                          return;
                        }
                        rejectEntryMutation.mutate({ entryId: entry.id, reason });
                      }}
                      disabled={rejectEntryMutation.isPending}
                    >
                      {rejectEntryMutation.isPending ? t("moderation.rejecting") : t("moderation.reject")}
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
            <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto rounded-md border border-brand-100 bg-surface/70 p-2 pr-3">
              {queueQuery.data?.examples.map((example) => (
                <article key={example.id} className="rounded-md border border-brand-100 p-3">
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-brand-900">{t("moderation.exampleForEntry")}:</span>{" "}
                    <Link className="font-medium text-brand-700 hover:underline" to={`/entries/${example.entry_slug}`}>
                      {example.entry_headword}
                    </Link>
                  </p>
                  <p className="text-sm text-slate-800">{example.sentence_original}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      className="px-2.5 py-1 text-xs disabled:opacity-35"
                      onClick={() => approveExampleMutation.mutate(example.id)}
                      disabled={approveExampleMutation.isPending}
                    >
                      {approveExampleMutation.isPending ? t("moderation.approving") : t("moderation.approve")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="px-2.5 py-1 text-xs disabled:opacity-35"
                      onClick={() => {
                        const reason = promptRequiredReason(t("moderation.prompt.exampleRejectReason"));
                        if (!reason) {
                          return;
                        }
                        rejectExampleMutation.mutate({ exampleId: example.id, reason });
                      }}
                      disabled={rejectExampleMutation.isPending}
                    >
                      {rejectExampleMutation.isPending ? t("moderation.rejecting") : t("moderation.reject")}
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
                <span className="inline-flex flex-wrap items-center gap-1">
                  <Link
                    className="font-medium text-brand-700 hover:underline"
                    to={report.reporter_profile_url ?? `/profiles/${report.reporter_user_id}`}
                  >
                    {report.reporter_display_name ?? t("moderation.unknownReporter")}
                  </Link>
                  {report.reporter_display_name ? (
                    <UserBadge displayName={report.reporter_display_name} />
                  ) : null}
                </span>
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

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("moderation.dashboardTitle")}</h2>
        <p className="mt-1 text-sm text-slate-700">{t("moderation.dashboardSubtitle")}</p>

        {dashboardQuery.isLoading ? (
          <p className="mt-3 text-sm text-slate-600">{t("moderation.dashboardLoading")}</p>
        ) : null}
        {dashboardQuery.error ? (
          <p className="mt-3 text-sm text-red-700">{t("moderation.dashboardLoadError")}</p>
        ) : null}

        {dashboardQuery.data ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.usersTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">{dashboardQuery.data.users_total}</p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.entriesTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">{dashboardQuery.data.entries_total}</p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.examplesTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">{dashboardQuery.data.examples_total}</p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.openReportsTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">{dashboardQuery.data.open_reports_total}</p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.pendingEntriesTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">
                  {dashboardQuery.data.pending_entries_total}
                </p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {t("moderation.metric.pendingExamplesTotal")}
                </p>
                <p className="mt-1 text-2xl font-semibold text-brand-900">
                  {dashboardQuery.data.pending_examples_total}
                </p>
              </article>
              <article className="rounded-md border border-brand-100 bg-brand-50/20 p-3 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                    {t("moderation.metric.hostDisk")}
                  </p>
                  {hostDiskPercent !== null ? (
                    <p className="text-sm font-semibold text-brand-900">{hostDiskPercent.toFixed(1)}%</p>
                  ) : null}
                </div>
                {hostDisk ? (
                  <>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${hostDiskToneClass}`}
                        style={{ width: `${hostDiskPercent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {t("moderation.disk.usedOf", {
                        used: formatBytes(hostDisk.used_bytes, locale),
                        total: formatBytes(hostDisk.total_bytes, locale),
                      })}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {t("moderation.disk.free", {
                        free: formatBytes(hostDisk.free_bytes, locale),
                      })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("moderation.disk.path", {
                        path: hostDisk.path,
                      })}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">{t("moderation.disk.unavailable")}</p>
                )}
              </article>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { key: "newUsers", label: t("moderation.metric.newUsers"), data: dashboardQuery.data.new_users },
                { key: "newEntries", label: t("moderation.metric.newEntries"), data: dashboardQuery.data.new_entries },
                { key: "newExamples", label: t("moderation.metric.newExamples"), data: dashboardQuery.data.new_examples },
                {
                  key: "activeContributors",
                  label: t("moderation.metric.activeContributors"),
                  data: dashboardQuery.data.active_contributors,
                },
                { key: "votes", label: t("moderation.metric.votes"), data: dashboardQuery.data.votes },
                { key: "reports", label: t("moderation.metric.reports"), data: dashboardQuery.data.reports },
                {
                  key: "approvedEntries",
                  label: t("moderation.metric.approvedEntries"),
                  data: dashboardQuery.data.approved_entries,
                },
              ].map((metric) => (
                <article key={metric.key} className="rounded-md border border-brand-100 p-3">
                  <p className="text-sm font-medium text-brand-900">{metric.label}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {t("moderation.period.today")}: <strong>{metric.data.today}</strong> ·{" "}
                    {t("moderation.period.week")}: <strong>{metric.data.week}</strong> ·{" "}
                    {t("moderation.period.month")}: <strong>{metric.data.month}</strong>
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </Card>
    </section>
  );
}
