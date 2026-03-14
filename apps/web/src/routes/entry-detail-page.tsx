import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { applyZodErrors } from "@/lib/zod-form";
import { useI18n } from "@/i18n";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import { reportExample, voteExample } from "@/features/examples/api";
import { createExample, getEntry, reportEntry, voteEntry } from "@/features/entries/api";
import { approveEntry, rejectEntry } from "@/features/moderation/api";

type ExampleForm = {
  sentence_original: string;
  translation_pt?: string;
};

type ReportForm = {
  reason: string;
};

const REPORT_REASON_MAX = 280;

export function EntryDetailPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { t } = useI18n();
  const [showEntryReportForm, setShowEntryReportForm] = useState(false);

  const {
    data: entry,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["entry", slug],
    queryFn: () => getEntry(String(slug)),
    enabled: Boolean(slug),
  });

  const voteMutation = useMutation({
    mutationFn: (value: -1 | 1) => voteEntry(String(entry?.id), { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });

  const reportEntryMutation = useMutation({
    mutationFn: (reason: string) =>
      reportEntry(String(entry?.id), { reason_code: "other", free_text: reason }),
    onSuccess: () => {
      entryReportForm.reset();
      setShowEntryReportForm(false);
    },
  });

  const reportExampleMutation = useMutation({
    mutationFn: (exampleId: string) => reportExample(exampleId, { reason_code: "incorrect" }),
  });
  const voteExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; value: -1 | 1 }) =>
      voteExample(params.exampleId, { value: params.value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
  const approveEntryMutation = useMutation({
    mutationFn: () => approveEntry(String(entry?.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
  });
  const rejectEntryMutation = useMutation({
    mutationFn: () => rejectEntry(String(entry?.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
  });

  const exampleForm = useForm<ExampleForm>({
    defaultValues: {
      sentence_original: "",
      translation_pt: "",
    },
  });

  const entryReportForm = useForm<ReportForm>({
    defaultValues: {
      reason: "",
    },
  });

  const createExampleMutation = useMutation({
    mutationFn: (payload: ExampleForm) => createExample(String(entry?.id), payload),
    onSuccess: () => {
      exampleForm.reset();
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
  });

  const onExampleSubmit = exampleForm.handleSubmit((payload) => {
    exampleForm.clearErrors();
    const exampleSchema = z.object({
      sentence_original: z.string().trim().min(3, t("entry.error.sentenceMin")),
      translation_pt: z.string().optional(),
    });
    const parsed = exampleSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, exampleForm.setError);
      return;
    }
    createExampleMutation.mutate(parsed.data);
  });

  const onEntryReportSubmit = entryReportForm.handleSubmit((payload) => {
    entryReportForm.clearErrors();
    const reportSchema = z.object({
      reason: z
        .string()
        .trim()
        .min(5, t("entry.error.reportReasonMin"))
        .max(REPORT_REASON_MAX, t("entry.error.reportReasonMax")),
    });
    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, entryReportForm.setError);
      return;
    }
    reportEntryMutation.mutate(parsed.data.reason);
  });

  const canWrite = Boolean(currentUser);
  const isModerator = Boolean(currentUser?.is_superuser);

  if (isLoading) {
    return <p className="text-sm text-slate-700">{t("entry.loading")}</p>;
  }

  if (error || !entry) {
    return <p className="text-sm text-red-700">{t("entry.loadError")}</p>;
  }

  return (
    <section className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-brand-900">{entry.headword}</h1>
          <StatusBadge status={entry.status} />
        </div>
        <p className="mt-2 text-sm text-slate-700">{entry.short_definition}</p>
        <p className="mt-1 text-sm text-slate-600">{entry.gloss_pt || "-"}</p>
        <p className="mt-1 text-sm text-slate-600">
          {t("entry.submittedBy")}{" "}
          <Link className="text-brand-700 hover:underline" to={`/profiles/${entry.proposer.id}`}>
            {entry.proposer.display_name}
          </Link>
          {" · "}
          {t("reputation.label", { score: entry.proposer.reputation_score })}
        </p>
        {entry.morphology_notes ? (
          <p className="mt-2 text-sm text-slate-700">
            {t("entry.morphology")}: {entry.morphology_notes}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-10 rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-lg shadow-sm hover:border-brand-500 hover:bg-brand-50"
            onClick={() => voteMutation.mutate(1)}
            disabled={!canWrite || voteMutation.isPending}
            title={t("entry.upvote")}
            aria-label={t("entry.upvote")}
          >
            <span aria-hidden>{t("entry.upvoteEmoji")}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-10 rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-lg shadow-sm hover:border-red-500 hover:bg-red-100"
            onClick={() => voteMutation.mutate(-1)}
            disabled={!canWrite || voteMutation.isPending}
            title={t("entry.downvote")}
            aria-label={t("entry.downvote")}
          >
            <span aria-hidden>{t("entry.downvoteEmoji")}</span>
          </Button>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {t("entry.score", { score: entry.score_cache })}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={!canWrite || reportEntryMutation.isPending}
            onClick={() => setShowEntryReportForm((current) => !current)}
          >
            {t("entry.reportEntry")}
          </Button>
        </div>

        {canWrite && showEntryReportForm ? (
          <form
            className="mt-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
            onSubmit={(event) => {
              void onEntryReportSubmit(event).catch(() => undefined);
            }}
          >
            <label className="block text-sm font-medium text-slate-800" htmlFor="entry_report_reason">
              {t("entry.reportReason")}
            </label>
            <Textarea
              id="entry_report_reason"
              rows={3}
              maxLength={REPORT_REASON_MAX}
              placeholder={t("entry.reportReasonPlaceholder")}
              {...entryReportForm.register("reason")}
            />
            <p className="text-xs text-slate-600">
              {t("entry.reportReasonCount", {
                count: entryReportForm.watch("reason").trim().length,
                max: REPORT_REASON_MAX,
              })}
            </p>
            {entryReportForm.formState.errors.reason?.message ? (
              <p className="text-xs text-red-700">{entryReportForm.formState.errors.reason.message}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={reportEntryMutation.isPending}>
                {t("entry.submitReport")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  entryReportForm.reset();
                  setShowEntryReportForm(false);
                }}
              >
                {t("entry.cancelReport")}
              </Button>
            </div>
          </form>
        ) : null}

        {!canWrite ? (
          <p className="mt-3 text-sm text-amber-800">
            {t("entry.signInPrompt")} <Link to="/login">{t("entry.goToLogin")}</Link>.
          </p>
        ) : null}

        {voteMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">{getLocalizedApiErrorMessage(voteMutation.error, t)}</p>
        ) : null}
        {reportEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.reportSubmitted")}</p>
        ) : null}

        {isModerator ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-4">
            <Button
              type="button"
              onClick={() => approveEntryMutation.mutate()}
              disabled={approveEntryMutation.isPending || entry.status === "approved"}
            >
              {t("entry.approve")}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => rejectEntryMutation.mutate()}
              disabled={rejectEntryMutation.isPending || entry.status === "rejected"}
            >
              {t("entry.reject")}
            </Button>
          </div>
        ) : null}

        {approveEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.approvedSuccess")}</p>
        ) : null}
        {rejectEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.rejectedSuccess")}</p>
        ) : null}
        {approveEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(approveEntryMutation.error, t)}
          </p>
        ) : null}
        {rejectEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(rejectEntryMutation.error, t)}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("entry.usageExamples")}</h2>
        <div className="mt-3 space-y-3">
          {entry.examples.length ? (
            entry.examples.map((example) => (
              <article key={example.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-800">{example.sentence_original}</p>
                  <StatusBadge status={example.status} />
                </div>
                {example.translation_pt ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {t("entry.translationPt")}: {example.translation_pt}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 w-8 rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-base shadow-sm hover:border-brand-500 hover:bg-brand-50"
                    onClick={() => voteExampleMutation.mutate({ exampleId: example.id, value: 1 })}
                    disabled={!canWrite || voteExampleMutation.isPending}
                    title={t("entry.upvote")}
                    aria-label={t("entry.upvote")}
                  >
                    <span aria-hidden>{t("entry.upvoteEmoji")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 w-8 rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-base shadow-sm hover:border-red-500 hover:bg-red-100"
                    onClick={() => voteExampleMutation.mutate({ exampleId: example.id, value: -1 })}
                    disabled={!canWrite || voteExampleMutation.isPending}
                    title={t("entry.downvote")}
                    aria-label={t("entry.downvote")}
                  >
                    <span aria-hidden>{t("entry.downvoteEmoji")}</span>
                  </Button>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                    {t("entry.exampleScore", { score: example.score_cache })}
                  </span>
                </div>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => reportExampleMutation.mutate(example.id)}
                    disabled={reportExampleMutation.isPending}
                  >
                    {t("entry.reportExample")}
                  </Button>
                ) : null}
                {voteExampleMutation.error instanceof ApiError ? (
                  <p className="mt-2 text-xs text-red-700">
                    {getLocalizedApiErrorMessage(voteExampleMutation.error, t)}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">{t("entry.noExamples")}</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("entry.versionHistory")}</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-brand-700">{t("entry.showVersions")}</summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {entry.versions.map((version) => (
              <li key={version.id}>
                v{version.version_number} · {version.edit_summary || t("entry.noSummary")}
              </li>
            ))}
          </ul>
        </details>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">{t("entry.addExample")}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              void onExampleSubmit(event).catch(() => undefined);
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="sentence_original">
                {t("entry.sentence")}
              </label>
              <Textarea id="sentence_original" {...exampleForm.register("sentence_original")} />
              {exampleForm.formState.errors.sentence_original?.message ? (
                <p className="mt-1 text-xs text-red-700">
                  {exampleForm.formState.errors.sentence_original.message}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="translation_pt">
                {t("entry.translationPt")}
              </label>
              <Input id="translation_pt" {...exampleForm.register("translation_pt")} />
            </div>
            {createExampleMutation.error instanceof ApiError ? (
              <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(createExampleMutation.error, t)}</p>
            ) : null}
            {createExampleMutation.isSuccess ? (
              <p className="text-sm text-green-700">{t("entry.exampleSubmitted")}</p>
            ) : null}
            <Button type="submit" disabled={createExampleMutation.isPending}>
              {t("entry.submitExample")}
            </Button>
          </form>
        </Card>
      ) : null}
    </section>
  );
}
