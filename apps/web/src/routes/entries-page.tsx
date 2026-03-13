import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listEntries } from "@/features/entries/api";

export function EntriesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [sort, setSort] = useState<"newest" | "score" | "most_examples">("newest");

  const params = useMemo(
    () => ({
      page: 1,
      page_size: 50,
      search,
      status,
      part_of_speech: partOfSpeech,
      sort,
    }),
    [search, status, partOfSpeech, sort],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["entries", params],
    queryFn: () => listEntries(params),
  });

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">Browse entries</h1>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Input
            aria-label="Search entries"
            value={search}
            placeholder="Search headword or gloss"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="disputed">disputed</option>
            <option value="rejected">rejected</option>
            <option value="archived">archived</option>
          </select>
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={partOfSpeech}
            onChange={(event) => setPartOfSpeech(event.target.value)}
          >
            <option value="">All parts of speech</option>
            <option value="noun">noun</option>
            <option value="verb">verb</option>
            <option value="adjective">adjective</option>
            <option value="adverb">adverb</option>
            <option value="expression">expression</option>
            <option value="other">other</option>
          </select>
          <select
            className="rounded-md border border-brand-300 bg-white px-3 py-2 text-sm"
            value={sort}
            onChange={(event) => setSort(event.target.value as "newest" | "score" | "most_examples")}
          >
            <option value="newest">Newest</option>
            <option value="score">Score</option>
            <option value="most_examples">Most examples</option>
          </select>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-brand-900">Results</h2>
        <div className="mt-4 space-y-3" data-testid="entry-list">
          {isLoading ? <p className="text-sm text-slate-600">Loading entries...</p> : null}
          {!isLoading && !data?.items.length ? (
            <p className="text-sm text-slate-600">No matching entries.</p>
          ) : null}
          {data?.items.map((entry) => (
            <article key={entry.id} className="rounded-md border border-brand-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <Link className="font-semibold text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                  {entry.headword}
                </Link>
                <StatusBadge status={entry.status} />
              </div>
              <p className="mt-1 text-sm text-slate-700">{entry.short_definition}</p>
              <p className="mt-2 text-xs text-slate-600">
                Score: {entry.score_cache} · Examples: {entry.example_count_cache}
              </p>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
