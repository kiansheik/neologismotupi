import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { applyZodErrors } from "@/lib/zod-form";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { splitEntryDefinition } from "@/lib/entry-definition";
import { formatDate } from "@/i18n/formatters";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { reportExample, voteExample } from "@/features/examples/api";
import { createExample, getEntry, reportEntry, updateEntry, voteEntry } from "@/features/entries/api";
import { approveEntry, approveExample, rejectEntry, rejectExample } from "@/features/moderation/api";

type ExampleForm = {
  sentence_original: string;
  translation_pt?: string;
};

type ReportForm = {
  reason: string;
};

type EntryEditForm = {
  headword: string;
  gloss_pt: string;
  gloss_en: string;
  part_of_speech: string;
  short_definition: string;
  morphology_notes: string;
  edit_summary: string;
};

const REPORT_REASON_MAX = 280;

export function EntryDetailPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { locale, t } = useI18n();
  const [showEntryReportForm, setShowEntryReportForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

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
    onSuccess: (_, value) => {
      trackEvent("entry_voted", { direction: value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error, value) => {
      trackEvent("entry_vote_failed", {
        direction: value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const reportEntryMutation = useMutation({
    mutationFn: (reason: string) =>
      reportEntry(String(entry?.id), { reason_code: "other", free_text: reason }),
    onSuccess: (_, reason) => {
      trackEvent("entry_report_submitted", { reason_length: reason.trim().length });
      entryReportForm.reset();
      setShowEntryReportForm(false);
    },
    onError: (error) => {
      trackEvent("entry_report_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const reportExampleMutation = useMutation({
    mutationFn: (exampleId: string) => reportExample(exampleId, { reason_code: "incorrect" }),
    onSuccess: () => {
      trackEvent("example_report_submitted");
    },
    onError: (error) => {
      trackEvent("example_report_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });
  const voteExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; value: -1 | 1 }) =>
      voteExample(params.exampleId, { value: params.value }),
    onSuccess: (_, params) => {
      trackEvent("example_voted", { direction: params.value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error, params) => {
      trackEvent("example_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const approveEntryMutation = useMutation({
    mutationFn: () => approveEntry(String(entry?.id)),
    onSuccess: () => {
      trackEvent("moderation_entry_approved");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_entry_approve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const rejectEntryMutation = useMutation({
    mutationFn: (reason: string) => rejectEntry(String(entry?.id), { reason }),
    onSuccess: () => {
      trackEvent("moderation_entry_rejected");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
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
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
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
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_example_reject_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
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

  const entryEditForm = useForm<EntryEditForm>({
    defaultValues: {
      headword: "",
      gloss_pt: "",
      gloss_en: "",
      part_of_speech: "",
      short_definition: "",
      morphology_notes: "",
      edit_summary: "",
    },
  });

  useEffect(() => {
    if (!entry) {
      return;
    }
    entryEditForm.reset({
      headword: entry.headword ?? "",
      gloss_pt: entry.gloss_pt ?? "",
      gloss_en: entry.gloss_en ?? "",
      part_of_speech: entry.part_of_speech ?? "",
      short_definition: entry.short_definition ?? "",
      morphology_notes: entry.morphology_notes ?? "",
      edit_summary: "",
    });
  }, [entry, entryEditForm]);

  const createExampleMutation = useMutation({
    mutationFn: (payload: ExampleForm) => createExample(String(entry?.id), payload),
    onSuccess: (_, payload) => {
      trackEvent("example_submitted", {
        has_translation_pt: Boolean(payload.translation_pt?.trim()),
      });
      exampleForm.reset();
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error) => {
      trackEvent("example_submit_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateEntry>[1]) => updateEntry(String(entry?.id), payload),
    onSuccess: () => {
      trackEvent("entry_moderator_edited");
      entryEditForm.resetField("edit_summary");
      setShowEditForm(false);
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("entry_moderator_edit_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
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

  const onEntryEditSubmit = entryEditForm.handleSubmit((payload) => {
    entryEditForm.clearErrors();
    const editSchema = z.object({
      headword: z.string().trim().min(1, t("submit.error.headwordRequired")),
      gloss_pt: z.string().trim().min(1, t("submit.error.glossRequired")),
      gloss_en: z.string().optional(),
      part_of_speech: z.string().optional(),
      short_definition: z.string().optional(),
      morphology_notes: z.string().optional(),
      edit_summary: z.string().trim().min(3, t("entry.error.editSummaryMin")),
    });
    const parsed = editSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, entryEditForm.setError);
      return;
    }
    updateEntryMutation.mutate(parsed.data);
  });

  const canWrite = Boolean(currentUser);
  const isModerator = Boolean(currentUser?.is_superuser);
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

  if (isLoading) {
    return <p className="text-sm text-slate-700">{t("entry.loading")}</p>;
  }

  if (error || !entry) {
    return <p className="text-sm text-red-700">{t("entry.loadError")}</p>;
  }

  const definitionParts = splitEntryDefinition(entry.short_definition);

  return (
    <section className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-brand-900">{entry.headword}</h1>
          <StatusBadge status={entry.status} />
        </div>
        {definitionParts.length <= 1 ? (
          <p className="mt-2 text-sm text-slate-700">{entry.short_definition}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {definitionParts.map((part, index) => (
              <li key={`${index}-${part}`} className="flex gap-2">
                <span className="mt-0.5 text-brand-700">•</span>
                <span>{part}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-sm text-slate-600">{entry.gloss_pt || "-"}</p>
        <p className="mt-1 text-sm text-slate-600">
          {t("entry.submittedBy")}{" "}
          <span className="inline-flex flex-wrap items-center gap-1">
            <Link className="text-brand-700 hover:underline" to={`/profiles/${entry.proposer.id}`}>
              {entry.proposer.display_name}
            </Link>
            <UserBadge displayName={entry.proposer.display_name} badges={entry.proposer.badges} />
            <span>· {t("reputation.label", { score: entry.proposer.reputation_score })}</span>
          </span>
        </p>
        <p className="mt-1 text-sm text-slate-600">{t("entry.firstRegistered", { date: formatDate(entry.created_at, locale) })}</p>
        {(entry.status === "rejected" || entry.status === "disputed") &&
        (entry.moderation_reason || entry.moderation_notes) ? (
          <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-800">
            {t("entry.moderationReason")}: {entry.moderation_reason || entry.moderation_notes}
          </p>
        ) : null}
        {entry.morphology_notes ? (
          <p className="mt-2 text-sm text-slate-700">
            {t("entry.morphology")}: {entry.morphology_notes}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-lg leading-none shadow-sm hover:border-brand-500 hover:bg-brand-50"
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-lg leading-none shadow-sm hover:border-red-500 hover:bg-red-100"
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
            onClick={() => {
              setShowEntryReportForm((current) => !current);
              trackEvent("entry_report_form_toggled");
            }}
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
              onClick={() => {
                const reason = promptRequiredReason(t("moderation.prompt.entryRejectReason"));
                if (!reason) {
                  return;
                }
                rejectEntryMutation.mutate(reason);
              }}
              disabled={rejectEntryMutation.isPending || entry.status === "rejected"}
            >
              {t("entry.reject")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowEditForm((current) => !current);
                trackEvent("entry_moderator_edit_toggled");
              }}
            >
              {t("entry.editButton")}
            </Button>
          </div>
        ) : null}

        {isModerator && showEditForm ? (
          <form
            className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
            onSubmit={(event) => {
              void onEntryEditSubmit(event).catch(() => undefined);
            }}
          >
            <h3 className="text-sm font-semibold text-brand-900">{t("entry.editTitle")}</h3>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_headword">
                {t("submit.headword")}
              </label>
              <Input id="edit_headword" {...entryEditForm.register("headword")} />
              {entryEditForm.formState.errors.headword?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.headword.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_gloss_pt">
                {t("submit.glossPt")}
              </label>
              <Input id="edit_gloss_pt" {...entryEditForm.register("gloss_pt")} />
              {entryEditForm.formState.errors.gloss_pt?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.gloss_pt.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_gloss_en">
                {t("entry.editGlossEn")}
              </label>
              <Input id="edit_gloss_en" {...entryEditForm.register("gloss_en")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_part_of_speech">
                {t("submit.partOfSpeech")}
              </label>
              <select
                id="edit_part_of_speech"
                className="w-full rounded-md border border-brand-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                {...entryEditForm.register("part_of_speech")}
              >
                <option value="">{t("partOfSpeech.any")}</option>
                <option value="noun">{t("partOfSpeech.noun")}</option>
                <option value="verb">{t("partOfSpeech.verb")}</option>
                <option value="adjective">{t("partOfSpeech.adjective")}</option>
                <option value="adverb">{t("partOfSpeech.adverb")}</option>
                <option value="expression">{t("partOfSpeech.expression")}</option>
                <option value="pronoun">{t("partOfSpeech.pronoun")}</option>
                <option value="particle">{t("partOfSpeech.particle")}</option>
                <option value="other">{t("partOfSpeech.other")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_short_definition">
                {t("submit.definition")}
              </label>
              <Textarea id="edit_short_definition" {...entryEditForm.register("short_definition")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_morphology_notes">
                {t("entry.morphology")}
              </label>
              <Textarea id="edit_morphology_notes" {...entryEditForm.register("morphology_notes")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_summary">
                {t("entry.editSummary")}
              </label>
              <Input id="edit_summary" {...entryEditForm.register("edit_summary")} />
              <p className="mt-1 text-xs text-slate-600">{t("entry.editSummaryHelp")}</p>
              {entryEditForm.formState.errors.edit_summary?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.edit_summary.message}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={updateEntryMutation.isPending}>
                {t("entry.editSave")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  entryEditForm.reset({
                    headword: entry.headword ?? "",
                    gloss_pt: entry.gloss_pt ?? "",
                    gloss_en: entry.gloss_en ?? "",
                    part_of_speech: entry.part_of_speech ?? "",
                    short_definition: entry.short_definition ?? "",
                    morphology_notes: entry.morphology_notes ?? "",
                    edit_summary: "",
                  });
                  setShowEditForm(false);
                }}
              >
                {t("entry.editCancel")}
              </Button>
            </div>
          </form>
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
        {updateEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.editSaved")}</p>
        ) : null}
        {updateEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(updateEntryMutation.error, t)}
          </p>
        ) : null}
        {approveExampleMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(approveExampleMutation.error, t)}
          </p>
        ) : null}
        {rejectExampleMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(rejectExampleMutation.error, t)}
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
                {(example.status === "rejected" || example.status === "hidden") &&
                (example.moderation_reason || example.moderation_notes) ? (
                  <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                    {t("entry.moderationReason")}: {example.moderation_reason || example.moderation_notes}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-base leading-none shadow-sm hover:border-brand-500 hover:bg-brand-50"
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d3c6b0] bg-[#fffaf2] p-0 text-base leading-none shadow-sm hover:border-red-500 hover:bg-red-100"
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
                {isModerator ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => approveExampleMutation.mutate(example.id)}
                      disabled={approveExampleMutation.isPending || example.status === "approved"}
                    >
                      {t("moderation.approve")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        const reason = promptRequiredReason(t("moderation.prompt.exampleRejectReason"));
                        if (!reason) {
                          return;
                        }
                        rejectExampleMutation.mutate({ exampleId: example.id, reason });
                      }}
                      disabled={rejectExampleMutation.isPending || example.status === "rejected"}
                    >
                      {t("moderation.reject")}
                    </Button>
                  </div>
                ) : null}
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
