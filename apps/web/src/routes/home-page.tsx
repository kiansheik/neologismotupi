import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { listEntries } from "@/features/entries/api";

export function HomePage() {
  const { data } = useQuery({
    queryKey: ["entries", "home", "recent"],
    queryFn: () => listEntries({ page: 1, page_size: 5, sort: "newest" }),
  });

  return (
    <section className="space-y-6">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">Nheenga Neologismos</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700">
          Community record of proposed and attested contemporary Tupi usage. This is a community
          platform, not an official dictionary.
        </p>
        <div className="mt-4 flex gap-3">
          <Link className="rounded-md bg-brand-700 px-4 py-2 text-sm text-white" to="/entries">
            Browse entries
          </Link>
          <Link className="rounded-md bg-white px-4 py-2 text-sm text-brand-800 ring-1 ring-brand-300" to="/submit">
            Submit a proposal
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">Recent entries</h2>
        <div className="mt-4 space-y-3">
          {data?.items.length ? (
            data.items.map((entry) => (
              <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link className="font-medium text-brand-800 hover:underline" to={`/entries/${entry.slug}`}>
                    {entry.headword}
                  </Link>
                  <StatusBadge status={entry.status} />
                </div>
                <p className="mt-1 text-sm text-slate-700">{entry.short_definition}</p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">No entries yet.</p>
          )}
        </div>
      </Card>
    </section>
  );
}
