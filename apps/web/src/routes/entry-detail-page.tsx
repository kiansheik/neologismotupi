import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import { reportExample } from "@/features/examples/api";
import { createExample, getEntry, reportEntry, voteEntry } from "@/features/entries/api";

const exampleSchema = z.object({
  sentence_original: z.string().min(3),
  translation_pt: z.string().optional(),
  translation_en: z.string().optional(),
});

type ExampleForm = z.infer<typeof exampleSchema>;

export function EntryDetailPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

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
    mutationFn: () => reportEntry(String(entry?.id), { reason_code: "incorrect" }),
  });

  const reportExampleMutation = useMutation({
    mutationFn: (exampleId: string) => reportExample(exampleId, { reason_code: "incorrect" }),
  });

  const exampleForm = useForm<ExampleForm>({
    resolver: zodResolver(exampleSchema),
    defaultValues: {
      sentence_original: "",
      translation_pt: "",
      translation_en: "",
    },
  });

  const createExampleMutation = useMutation({
    mutationFn: (payload: ExampleForm) => createExample(String(entry?.id), payload),
    onSuccess: () => {
      exampleForm.reset();
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
  });

  const canWrite = Boolean(currentUser);

  if (isLoading) {
    return <p className="text-sm text-slate-700">Loading entry...</p>;
  }

  if (error || !entry) {
    return <p className="text-sm text-red-700">Unable to load entry.</p>;
  }

  return (
    <section className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-brand-900">{entry.headword}</h1>
          <StatusBadge status={entry.status} />
        </div>
        <p className="mt-2 text-sm text-slate-700">{entry.short_definition}</p>
        <p className="mt-1 text-sm text-slate-600">
          {entry.gloss_pt || "-"} · {entry.gloss_en || "-"}
        </p>
        {entry.morphology_notes ? (
          <p className="mt-2 text-sm text-slate-700">Morphology: {entry.morphology_notes}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => voteMutation.mutate(1)} disabled={!canWrite || voteMutation.isPending}>
            Upvote
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => voteMutation.mutate(-1)}
            disabled={!canWrite || voteMutation.isPending}
          >
            Downvote
          </Button>
          <span className="text-sm text-slate-700">Score: {entry.score_cache}</span>
          <Button
            type="button"
            variant="ghost"
            disabled={!canWrite || reportEntryMutation.isPending}
            onClick={() => reportEntryMutation.mutate()}
          >
            Report entry
          </Button>
        </div>

        {!canWrite ? (
          <p className="mt-3 text-sm text-amber-800">
            Sign in to vote, report, or add examples. <Link to="/login">Go to login</Link>.
          </p>
        ) : null}

        {voteMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">{voteMutation.error.message}</p>
        ) : null}
        {reportEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">Report submitted.</p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">Usage examples</h2>
        <div className="mt-3 space-y-3">
          {entry.examples.length ? (
            entry.examples.map((example) => (
              <article key={example.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-800">{example.sentence_original}</p>
                  <StatusBadge status={example.status} />
                </div>
                {example.translation_pt ? (
                  <p className="mt-1 text-xs text-slate-600">PT: {example.translation_pt}</p>
                ) : null}
                {example.translation_en ? (
                  <p className="text-xs text-slate-600">EN: {example.translation_en}</p>
                ) : null}
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => reportExampleMutation.mutate(example.id)}
                    disabled={reportExampleMutation.isPending}
                  >
                    Report example
                  </Button>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">No approved examples yet.</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">Version history</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-brand-700">Show versions</summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {entry.versions.map((version) => (
              <li key={version.id}>
                v{version.version_number} · {version.edit_summary || "No summary"}
              </li>
            ))}
          </ul>
        </details>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">Add example sentence</h2>
          <form className="mt-3 space-y-3" onSubmit={exampleForm.handleSubmit((payload) => createExampleMutation.mutate(payload))}>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="sentence_original">
                Sentence
              </label>
              <Textarea id="sentence_original" {...exampleForm.register("sentence_original")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="translation_pt">
                Translation (PT)
              </label>
              <Input id="translation_pt" {...exampleForm.register("translation_pt")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="translation_en">
                Translation (EN)
              </label>
              <Input id="translation_en" {...exampleForm.register("translation_en")} />
            </div>
            {createExampleMutation.error instanceof ApiError ? (
              <p className="text-sm text-red-700">{createExampleMutation.error.message}</p>
            ) : null}
            {createExampleMutation.isSuccess ? (
              <p className="text-sm text-green-700">Example submitted.</p>
            ) : null}
            <Button type="submit" disabled={createExampleMutation.isPending}>
              Submit example
            </Button>
          </form>
        </Card>
      ) : null}
    </section>
  );
}
