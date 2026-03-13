import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import type { DuplicateHint } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks";
import { createEntry, listEntries } from "@/features/entries/api";

const schema = z.object({
  headword: z.string().min(1),
  gloss_pt: z.string().optional(),
  gloss_en: z.string().optional(),
  part_of_speech: z.string().optional(),
  short_definition: z.string().min(3),
  morphology_notes: z.string().optional(),
  force_submit: z.boolean().default(false),
});

type SubmitForm = z.infer<typeof schema>;

export function SubmitPage() {
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const [possibleDuplicates, setPossibleDuplicates] = useState<DuplicateHint[]>([]);

  const form = useForm<SubmitForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      headword: "",
      gloss_pt: "",
      gloss_en: "",
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
    return duplicateQuery.data?.filter((entry) => entry.headword !== watchedHeadword) ?? [];
  }, [duplicateQuery.data, watchedHeadword]);

  const createMutation = useMutation({
    mutationFn: (payload: SubmitForm) => createEntry(payload),
    onSuccess: (entry) => {
      navigate(`/entries/${entry.slug}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "possible_duplicates") {
        const details = error.details as { duplicates?: DuplicateHint[] } | undefined;
        setPossibleDuplicates(details?.duplicates ?? []);
      }
    },
  });

  if (!currentUser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">Submit a new entry</h1>
        <p className="mt-2 text-sm text-slate-700">
          You need an account to submit entries. <Link to="/login">Sign in</Link> or <Link to="/signup">create an account</Link>.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">Submit a new entry</h1>
      <form className="mt-4 space-y-3" onSubmit={form.handleSubmit((payload) => createMutation.mutate(payload))}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="headword">
            Headword
          </label>
          <Input id="headword" {...form.register("headword")} />
        </div>

        {(candidateDuplicates.length > 0 || possibleDuplicates.length > 0) && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="duplicate-warning">
            <p className="font-medium text-amber-900">Possible existing entries</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {[...candidateDuplicates, ...possibleDuplicates].slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  <Link className="text-brand-800 underline" to={`/entries/${entry.slug}`}>
                    {entry.headword}
                  </Link>
                  {entry.gloss_pt ? ` - ${entry.gloss_pt}` : ""}
                </li>
              ))}
            </ul>
            <label className="mt-2 inline-flex items-center gap-2 text-amber-900">
              <input type="checkbox" {...form.register("force_submit")} />
              I confirm this proposal is still distinct.
            </label>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="gloss_pt">
            Gloss (PT)
          </label>
          <Input id="gloss_pt" {...form.register("gloss_pt")} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="gloss_en">
            Gloss (EN)
          </label>
          <Input id="gloss_en" {...form.register("gloss_en")} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="part_of_speech">
            Part of speech
          </label>
          <Input id="part_of_speech" {...form.register("part_of_speech")} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="short_definition">
            Definition
          </label>
          <Textarea id="short_definition" {...form.register("short_definition")} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="morphology_notes">
            Morphology notes
          </label>
          <Textarea id="morphology_notes" {...form.register("morphology_notes")} />
        </div>

        {createMutation.error instanceof ApiError ? (
          <p className="text-sm text-red-700">{createMutation.error.message}</p>
        ) : null}

        <Button type="submit" disabled={createMutation.isPending}>
          Submit entry
        </Button>
      </form>
    </Card>
  );
}
