import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { partOfSpeechLabel } from "@/i18n/formatters";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import type { DuplicateHint } from "@/lib/types";
import { applyZodErrors } from "@/lib/zod-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import { AudioCapture, AudioQueueList } from "@/features/audio/components";
import { uploadEntryAudio } from "@/features/audio/api";
import { createEntry, getEntrySubmissionGate, listEntries } from "@/features/entries/api";
import { listSources } from "@/features/sources/api";
import { EtymologyBuilder } from "@/features/etymology-builder/EtymologyBuilder";
import type { SourceSuggestion } from "@/lib/types";

const HEADWORD_PATTERN = /^["']?[\p{L}](?:[\p{L}\p{M}'" -]*[\p{L}])?$/u;

function isValidHeadword(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return HEADWORD_PATTERN.test(trimmed);
}

type SubmitForm = {
  headword: string;
  gloss_pt: string;
  gloss_en?: string;
  part_of_speech?: string;
  short_definition?: string;
  has_source: boolean;
  source_authors?: string;
  source_title?: string;
  source_publication_year?: string;
  source_edition_label?: string;
  source_pages?: string;
  source_url?: string;
  morphology_notes?: string;
  force_submit: boolean;
};

export function SubmitPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateHint[]>([]);
  const [queuedAudio, setQueuedAudio] = useState<File[]>([]);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [builderNote, setBuilderNote] = useState("");
  const [isMorphologyOverride, setIsMorphologyOverride] = useState(false);

  const form = useForm<SubmitForm>({
    defaultValues: {
      headword: "",
      gloss_pt: "",
      gloss_en: "",
      part_of_speech: "",
      short_definition: "",
      has_source: false,
      source_authors: "",
      source_title: "",
      source_publication_year: "",
      source_edition_label: "",
      source_pages: "",
      source_url: "",
      morphology_notes: "",
      force_submit: false,
    },
  });

  const watchedHeadword = form.watch("headword");
  const hasSource = form.watch("has_source");
  const morphologyNotesValue = form.watch("morphology_notes");
  const watchedSourceAuthors = form.watch("source_authors");
  const watchedSourceTitle = form.watch("source_title");
  const sourceLookupQuery = useMemo(
    () => [watchedSourceAuthors, watchedSourceTitle].map((value) => value?.trim() ?? "").join(" ").trim(),
    [watchedSourceAuthors, watchedSourceTitle],
  );

  const duplicateQuery = useQuery({
    queryKey: ["duplicates", watchedHeadword],
    queryFn: async () => {
      const response = await listEntries({ page: 1, page_size: 5, search: watchedHeadword });
      return response.items;
    },
    enabled: watchedHeadword.trim().length >= 2,
  });

  const gateQuery = useQuery({
    queryKey: ["entry-submission-gate", currentUser?.id],
    queryFn: getEntrySubmissionGate,
    enabled: Boolean(currentUser?.id),
  });

  const votesToday = gateQuery.data?.votes_today ?? 0;
  const remainingPosts = gateQuery.data?.remaining_posts ?? 0;
  const isUnlimited = gateQuery.data?.unlimited ?? false;
  const nextVotesRequired = gateQuery.data?.next_votes_required ?? 0;
  const votesRequiredForUnlimited = gateQuery.data?.votes_required_for_unlimited ?? 0;
  const voteProgress = isUnlimited
    ? 100
    : votesRequiredForUnlimited > 0
      ? Math.min(100, (votesToday / votesRequiredForUnlimited) * 100)
      : 100;

  const sourceSuggestionsQuery = useQuery({
    queryKey: ["source-suggestions", sourceLookupQuery],
    queryFn: () => listSources({ query: sourceLookupQuery, limit: 8 }),
    enabled: hasSource && sourceLookupQuery.length >= 2,
    staleTime: 30_000,
  });

  const candidateDuplicates = useMemo(() => {
    const merged = [...(duplicateQuery.data ?? []), ...possibleDuplicates];
    const dedupedById = new Map(merged.map((entry) => [entry.id, entry]));
    return Array.from(dedupedById.values());
  }, [duplicateQuery.data, possibleDuplicates]);

  const headwordValid = isValidHeadword(watchedHeadword);
  const showHeadwordRules = watchedHeadword.trim().length > 0 && !headwordValid;
  const morphologyNotesField = form.register("morphology_notes", {
    onChange: () => {
      setIsMorphologyOverride(true);
    },
  });

  const addQueuedAudio = (file: File) => {
    setQueuedAudio((current) => [...current, file]);
  };
  const removeQueuedAudio = (index: number) => {
    setQueuedAudio((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };
  const clearQueuedAudio = () => {
    setQueuedAudio([]);
  };

  const handleBuilderNoteChange = useCallback(
    (note: string) => {
      setBuilderNote(note);
      if (!isMorphologyOverride) {
        form.setValue("morphology_notes", note, { shouldDirty: true });
      }
    },
    [form, isMorphologyOverride],
  );

  const handleApplyBuilderNote = useCallback(
    (note: string) => {
      form.setValue("morphology_notes", note, { shouldDirty: true });
      setIsMorphologyOverride(false);
    },
    [form],
  );

  const handleApplyBuilderHeadword = useCallback(
    (headword: string) => {
      form.setValue("headword", headword, { shouldDirty: true });
    },
    [form],
  );

  useEffect(() => {
    if (!builderNote) return;
    if (morphologyNotesValue === builderNote) {
      setIsMorphologyOverride(false);
    }
  }, [builderNote, morphologyNotesValue]);

  const applySourceSuggestion = (source: SourceSuggestion) => {
    form.setValue("source_authors", source.authors ?? "");
    form.setValue("source_title", source.title ?? "");
    form.setValue(
      "source_publication_year",
      source.publication_year !== null ? String(source.publication_year) : "",
    );
    form.setValue("source_edition_label", source.edition_label ?? "");
    form.setValue("source_url", "");
  };

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createEntry>[0]) => createEntry(payload),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "possible_duplicates") {
        const details = error.details as { duplicates?: DuplicateHint[] } | undefined;
        const duplicates = details?.duplicates ?? [];
        setPossibleDuplicates(duplicates);
        trackEvent("entry_submit_possible_duplicates", { duplicate_count: duplicates.length });
        return;
      }
      trackEvent("entry_submit_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const onSubmit = form.handleSubmit(async (payload) => {
    form.clearErrors();
    const schema = z.object({
      headword: z
        .string()
        .trim()
        .min(1, t("submit.error.headwordRequired"))
        .refine((value) => isValidHeadword(value), t("submit.error.headwordInvalid")),
      gloss_pt: z.string().trim().min(1, t("submit.error.glossRequired")),
      gloss_en: z.string().trim().max(255).optional(),
      part_of_speech: z.string().optional(),
      short_definition: z.string().trim().optional(),
      has_source: z.boolean().default(false),
      source_authors: z.string().trim().max(255).optional(),
      source_title: z.string().trim().max(400).optional(),
      source_publication_year: z.string().trim().optional(),
      source_edition_label: z.string().trim().max(120).optional(),
      source_pages: z.string().trim().max(120).optional(),
      source_url: z.string().trim().max(2048).optional(),
      morphology_notes: z.string().optional(),
      force_submit: z.boolean().default(false),
    }).superRefine((values, ctx) => {
      if (!values.has_source) {
        return;
      }
      if (!values.source_authors && !values.source_title) {
        ctx.addIssue({
          path: ["source_title"],
          code: "custom",
          message: t("submit.error.sourceNeedAuthorOrTitle"),
        });
      }
      if (values.source_url && !values.source_authors && !values.source_title) {
        ctx.addIssue({
          path: ["source_url"],
          code: "custom",
          message: t("submit.error.sourceNeedAuthorOrTitle"),
        });
      }
      if (!values.source_publication_year) {
        return;
      }
      const parsedYear = Number(values.source_publication_year);
      const isValidYear =
        Number.isInteger(parsedYear) && parsedYear >= 1 && parsedYear <= 3000;
      if (!isValidYear) {
        ctx.addIssue({
          path: ["source_publication_year"],
          code: "custom",
          message: t("submit.error.sourceInvalidYear"),
        });
      }
      if (values.source_url && !/^https?:\/\//i.test(values.source_url)) {
        ctx.addIssue({
          path: ["source_url"],
          code: "custom",
          message: t("submit.error.sourceInvalidUrl"),
        });
      }
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }

    const publicationYear = parsed.data.source_publication_year
      ? Number(parsed.data.source_publication_year)
      : undefined;

    let createdEntry;
    try {
      createdEntry = await createMutation.mutateAsync({
        headword: parsed.data.headword,
        gloss_pt: parsed.data.gloss_pt,
        gloss_en: parsed.data.gloss_en,
        part_of_speech: parsed.data.part_of_speech,
        short_definition: parsed.data.short_definition,
        source:
          parsed.data.has_source && (parsed.data.source_authors || parsed.data.source_title)
            ? {
                authors: parsed.data.source_authors || undefined,
                title: parsed.data.source_title || undefined,
                publication_year: publicationYear,
                edition_label: parsed.data.source_edition_label || undefined,
                pages: parsed.data.source_pages || undefined,
                url: parsed.data.source_url || undefined,
              }
            : undefined,
        morphology_notes: parsed.data.morphology_notes,
        force_submit: parsed.data.force_submit,
      });
    } catch {
      return;
    }

    if (queuedAudio.length > 0) {
      setIsUploadingAudio(true);
      for (const file of queuedAudio) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await uploadEntryAudio(createdEntry.id, file);
          trackEvent("audio_uploaded", { target: "entry_create" });
        } catch (error) {
          trackEvent("audio_upload_failed", {
            target: "entry_create",
            error_code: error instanceof ApiError ? error.code : "unknown",
          });
        }
      }
      setIsUploadingAudio(false);
      setQueuedAudio([]);
    }

    trackEvent("entry_submitted", {
      part_of_speech: createdEntry.part_of_speech ?? "unknown",
      status: createdEntry.status,
    });
    navigate(`/entries/${createdEntry.slug}`);
  });

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">
          {t("submit.authRequiredPrefix")} <Link to="/login">{t("submit.authRequiredSignIn")}</Link>{" "}
          {t("submit.authRequiredOr")} <Link to="/signup">{t("submit.authRequiredCreate")}</Link>.
        </p>
      </Card>
    );
  }

  if (gateQuery.isError) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
        <p className="mt-2 text-sm text-red-700">{t("submit.voteGateError")}</p>
      </Card>
    );
  }

  if (!gateQuery.isSuccess) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">{t("submit.voteGateLoading")}</p>
      </Card>
    );
  }

  if (!isUnlimited && remainingPosts <= 0) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
        <p className="mt-2 text-sm text-slate-700">
          {t("submit.voteGateBody")}
        </p>
        <div className="mt-3 rounded-md border border-brand-200 bg-brand-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                {t("submit.dailyVotesLabel")}
              </p>
              <p className="text-3xl font-semibold text-brand-900">{votesToday}</p>
              <p className="text-xs text-slate-600">{t("submit.dailyVotesUnits")}</p>
            </div>
            <div className="min-w-[180px] text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                {t("submit.dailyPostsLabel")}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-800">
                {t("submit.dailyPostsRemaining", { remaining: remainingPosts })}
              </p>
              <p className="mt-1 text-amber-700">
                {t("submit.dailyUnlockHint", { needed: nextVotesRequired })}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-brand-100">
            <div
              className="h-2 rounded-full bg-brand-600 transition-all"
              style={{ width: `${voteProgress}%` }}
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-700">{t("submit.voteGateHint")}</p>
        <div className="mt-3">
          <Link
            className="inline-flex items-center rounded-md bg-brand-700 px-4 py-2 text-sm text-white"
            to="/entries?unseen=1"
          >
            {t("submit.voteGateCta")}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
        <EtymologyBuilder
          onNoteChange={handleBuilderNoteChange}
          onApplyNote={handleApplyBuilderNote}
          isManualOverride={isMorphologyOverride}
          onApplyHeadword={handleApplyBuilderHeadword}
        />
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
        {/* Orthography Notice */}
        <div className="mt-2 mb-3 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          {t("submit.orthographyNotice")}
        </div>
        <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
        <p className="mt-1 text-xs text-slate-600">{t("submit.onlyRequired")}</p>
        <div className="mt-2 rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2 text-xs text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-800">
                {t("submit.dailyVotesLabel")}
              </p>
              <p className="text-lg font-semibold text-brand-900">{votesToday}</p>
              <p className="text-[11px] text-slate-600">{t("submit.dailyVotesUnits")}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-800">
                {t("submit.dailyPostsLabel")}
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {isUnlimited
                  ? t("submit.dailyPostsUnlimited")
                  : t("submit.dailyPostsRemaining", { remaining: remainingPosts })}
              </p>
            </div>
            {!isUnlimited ? (
              <p className="text-[11px] text-amber-700">
                {t("submit.dailyUnlockHint", { needed: nextVotesRequired })}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-700">{t("submit.dailyUnlockAll")}</p>
            )}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-brand-100">
            <div
              className="h-1.5 rounded-full bg-brand-600 transition-all"
              style={{ width: `${voteProgress}%` }}
            />
          </div>
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            void onSubmit(event).catch(() => undefined);
          }}
        >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="headword">
            {t("submit.headword")} *
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.headword")}</p>
          <Input
            id="headword"
            placeholder="bebesara"
            className={
              showHeadwordRules
                ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                : undefined
            }
            {...form.register("headword")}
          />
          {form.formState.errors.headword?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.headword.message}</p>
          ) : null}
          {showHeadwordRules ? (
            <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              <p className="font-semibold">{t("submit.headwordRulesTitle")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>{t("submit.headwordRuleChars")}</li>
                <li>{t("submit.headwordRuleSingle")}</li>
                <li>{t("submit.headwordRuleVariants")}</li>
              </ul>
            </div>
          ) : null}
        </div>

        {candidateDuplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="duplicate-warning">
            <p className="font-medium text-amber-900">{t("submit.duplicatesTitle")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {candidateDuplicates.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <Link
                    className="text-brand-800 underline"
                    to={`/entries/${entry.slug}`}
                    onClick={() => trackEvent("duplicate_hint_opened")}
                  >
                    {entry.headword}
                  </Link>
                  {entry.gloss_pt ? ` - ${entry.gloss_pt}` : ""}
                </li>
              ))}
            </ul>
            <label className="mt-2 inline-flex items-center gap-2 text-amber-900">
              <input type="checkbox" {...form.register("force_submit")} />
              {t("submit.distinctCheckbox")}
            </label>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs text-slate-600">{t("submit.help.glossBlurb")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="gloss_pt">
                {t("submit.glossPt")} *
              </label>
              <Input id="gloss_pt" placeholder="avião" {...form.register("gloss_pt")} />
              {form.formState.errors.gloss_pt?.message ? (
                <p className="mt-1 text-xs text-red-700">{form.formState.errors.gloss_pt.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="gloss_en">
                {t("submit.glossEn")} ({t("form.optional")})
              </label>
              <Input id="gloss_en" {...form.register("gloss_en")} />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="part_of_speech">
            {t("submit.partOfSpeech")} ({t("form.optional")})
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.partOfSpeech")}</p>
          <select
            id="part_of_speech"
            className="w-full rounded-md border border-brand-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            {...form.register("part_of_speech")}
          >
            <option value="">{t("partOfSpeech.any")}</option>
            <option value="noun">{partOfSpeechLabel("noun", t)}</option>
            <option value="verb">{partOfSpeechLabel("verb", t)}</option>
            <option value="adjective">{partOfSpeechLabel("adjective", t)}</option>
            <option value="adverb">{partOfSpeechLabel("adverb", t)}</option>
            <option value="expression">{partOfSpeechLabel("expression", t)}</option>
            <option value="other">{partOfSpeechLabel("other", t)}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="short_definition">
            {t("submit.definition")} ({t("form.optional")})
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.definition")}</p>
          <Textarea
            id="short_definition"
            placeholder="veículo de se locomover voando"
            {...form.register("short_definition")}
          />
        </div>

        <div className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
            <input type="checkbox" {...form.register("has_source")} />
            {t("submit.sourceToggle")}
          </label>
          <p className="mt-1 text-xs text-slate-600">{t("submit.help.sourceCitation")}</p>

          {hasSource ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="source_authors">
                    {t("submit.sourceAuthors")} ({t("form.optional")})
                  </label>
                  <Input
                    id="source_authors"
                    placeholder="JOSÉ ROMILDO ARAÚJO DA SILVA (GUYRAAKANGA POTIGUARA)"
                    {...form.register("source_authors")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="source_title">
                    {t("submit.sourceTitle")} ({t("form.optional")})
                  </label>
                  <Input id="source_title" placeholder="Tupi Potiguara Kuapa" {...form.register("source_title")} />
                  {form.formState.errors.source_title?.message ? (
                    <p className="mt-1 text-xs text-red-700">{form.formState.errors.source_title.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="source_publication_year">
                    {t("submit.sourceYear")} ({t("form.optional")})
                  </label>
                  <Input
                    id="source_publication_year"
                    inputMode="numeric"
                    placeholder="2024"
                    {...form.register("source_publication_year")}
                  />
                  {form.formState.errors.source_publication_year?.message ? (
                    <p className="mt-1 text-xs text-red-700">
                      {form.formState.errors.source_publication_year.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="source_edition_label">
                    {t("submit.sourceEdition")} ({t("form.optional")})
                  </label>
                  <Input id="source_edition_label" placeholder="1ª Edição" {...form.register("source_edition_label")} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor="source_pages">
                    {t("submit.sourcePages")} ({t("form.optional")})
                  </label>
                  <Input id="source_pages" placeholder="119" {...form.register("source_pages")} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="source_url">
                  {t("submit.sourceUrl")} ({t("form.optional")})
                </label>
                <Input id="source_url" placeholder="https://..." {...form.register("source_url")} />
                {form.formState.errors.source_url?.message ? (
                  <p className="mt-1 text-xs text-red-700">{form.formState.errors.source_url.message}</p>
                ) : null}
              </div>

              {sourceSuggestionsQuery.data && sourceSuggestionsQuery.data.length > 0 ? (
                <div className="rounded-md border border-brand-200 bg-white p-2">
                  <p className="text-xs font-semibold text-brand-900">{t("submit.sourceSuggestionsTitle")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sourceSuggestionsQuery.data.map((source) => (
                      <button
                        key={`${source.work_id}-${source.edition_id}`}
                        type="button"
                        className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-800 hover:border-brand-500 hover:bg-brand-50"
                        onClick={() => applySourceSuggestion(source)}
                      >
                        {source.citation}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="morphology_notes">
            {t("submit.morphologyNotes")} ({t("form.optional")})
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.morphologyNotes")}</p>
          <Textarea
            id="morphology_notes"
            placeholder="bebé - voar; sara - agente; o que voa"
            {...morphologyNotesField}
          />
        </div>
        <div className="rounded-md border border-brand-100 bg-white/70 p-3">
          <p className="text-sm font-semibold text-brand-900">{t("submit.audioTitle")}</p>
          <p className="mt-1 text-xs text-slate-600">{t("submit.audioHelp")}</p>
          <div className="mt-2">
            <AudioCapture
              t={t}
              locale={locale}
              onCapture={addQueuedAudio}
              disabled={createMutation.isPending || isUploadingAudio}
            />
          </div>
          <div className="mt-2">
            <AudioQueueList
              files={queuedAudio}
              locale={locale}
              t={t}
              onRemove={removeQueuedAudio}
              onClear={clearQueuedAudio}
            />
          </div>
          {isUploadingAudio ? (
            <p className="mt-2 text-xs text-slate-600">{t("audio.uploading")}</p>
          ) : null}
        </div>

        {createMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(createMutation.error, t)}</p>
        ) : null}

        <Button type="submit" disabled={createMutation.isPending || isUploadingAudio}>
          {t("submit.button")}
        </Button>
      </form>
    </Card>
  </div>
  );
}
