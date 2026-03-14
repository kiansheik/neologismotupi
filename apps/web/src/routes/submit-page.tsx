import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { createEntry, listEntries } from "@/features/entries/api";

type SubmitForm = {
  headword: string;
  gloss_pt: string;
  part_of_speech?: string;
  short_definition?: string;
  morphology_notes?: string;
  force_submit: boolean;
};

export function SubmitPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateHint[]>([]);

  const form = useForm<SubmitForm>({
    defaultValues: {
      headword: "",
      gloss_pt: "",
      part_of_speech: "",
      short_definition: "",
      morphology_notes: "",
      force_submit: false,
    },
  });

  const watchedHeadword = form.watch("headword");

  const duplicateQuery = useQuery({
    queryKey: ["duplicates", watchedHeadword],
    queryFn: async () => {
      const response = await listEntries({ page: 1, page_size: 5, search: watchedHeadword });
      return response.items;
    },
    enabled: watchedHeadword.trim().length >= 2,
  });

  const candidateDuplicates = useMemo(() => {
    const merged = [...(duplicateQuery.data ?? []), ...possibleDuplicates];
    const dedupedById = new Map(merged.map((entry) => [entry.id, entry]));
    return Array.from(dedupedById.values());
  }, [duplicateQuery.data, possibleDuplicates]);

  const createMutation = useMutation({
    mutationFn: (payload: SubmitForm) => createEntry(payload),
    onSuccess: (entry) => {
      trackEvent("entry_submitted", {
        part_of_speech: entry.part_of_speech ?? "unknown",
        status: entry.status,
      });
      navigate(`/entries/${entry.slug}`);
    },
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

  const onSubmit = form.handleSubmit((payload) => {
    form.clearErrors();
    const schema = z.object({
      headword: z.string().trim().min(1, t("submit.error.headwordRequired")),
      gloss_pt: z.string().trim().min(1, t("submit.error.glossRequired")),
      part_of_speech: z.string().optional(),
      short_definition: z.string().trim().optional(),
      morphology_notes: z.string().optional(),
      force_submit: z.boolean().default(false),
    });
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, form.setError);
      return;
    }
    createMutation.mutate(parsed.data);
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

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">{t("submit.title")}</h1>
      <p className="mt-1 text-xs text-slate-600">{t("submit.onlyRequired")}</p>
      <div className="mt-3 rounded-md border border-brand-200 bg-brand-50/40 p-3">
        <h2 className="text-sm font-semibold text-brand-900">{t("submit.exampleTitle")}</h2>
        <div className="mt-2 space-y-2 text-xs text-slate-700">
          <p>
            <span className="font-semibold">{t("submit.exampleHeadword")}:</span>{" "}
            <Link className="text-brand-700 underline" to="/entries/mba-eekokuaba">
              Mba&apos;eekokuaba
            </Link>
          </p>
          <p>
            <span className="font-semibold">{t("submit.exampleGloss")}:</span> Física
          </p>
          <p>
            <span className="font-semibold">{t("submit.examplePartOfSpeech")}:</span>{" "}
            {partOfSpeechLabel("noun", t)}
          </p>
          <p>
            <span className="font-semibold">{t("submit.exampleDefinition")}:</span> Física.
          </p>
          <p>
            <span className="font-semibold">{t("entry.morphology")}:</span>{" "}
            Calque do guarani, estudo de como as coisas agem. &quot;Estudo&quot; deixado como kuaba, verbo
            nominalizado, pois é o ato de estudar, e não alguma circunstância.
          </p>
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
            {t("submit.headword")}
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.headword")}</p>
          <Input id="headword" {...form.register("headword")} />
          {form.formState.errors.headword?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.headword.message}</p>
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
          <label className="mb-1 block text-sm font-medium" htmlFor="gloss_pt">
            {t("submit.glossPt")}
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.glossPt")}</p>
          <Input id="gloss_pt" {...form.register("gloss_pt")} />
          {form.formState.errors.gloss_pt?.message ? (
            <p className="mt-1 text-xs text-red-700">{form.formState.errors.gloss_pt.message}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="part_of_speech">
            {t("submit.partOfSpeech")}
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
            {t("submit.definition")}
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.definition")}</p>
          <Textarea id="short_definition" {...form.register("short_definition")} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="morphology_notes">
            {t("submit.morphologyNotes")}
          </label>
          <p className="mb-1 text-xs text-slate-600">{t("submit.help.morphologyNotes")}</p>
          <Textarea id="morphology_notes" {...form.register("morphology_notes")} />
        </div>

        {createMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(createMutation.error, t)}</p>
        ) : null}

        <Button type="submit" disabled={createMutation.isPending}>
          {t("submit.button")}
        </Button>
      </form>
    </Card>
  );
}
