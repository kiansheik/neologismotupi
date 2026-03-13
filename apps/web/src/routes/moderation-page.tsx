import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { StatusBadge } from "@/components/status-badge";
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

export function ModerationPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();

  const queueQuery = useQuery({
    queryKey: ["mod-queue"],
    queryFn: getModerationQueue,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const reportsQuery = useQuery({
    queryKey: ["mod-reports"],
    queryFn: getModerationReports,
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
        <h1 className="text-xl font-semibold text-brand-900">Moderation</h1>
        <p className="mt-2 text-sm text-slate-700">Sign in as a moderator to access this page.</p>
      </Card>
    );
  }

  if (!currentUser.is_superuser) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">Moderation</h1>
        <p className="mt-2 text-sm text-red-700">You do not have moderator permissions.</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold text-brand-900">Moderation queue</h1>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-brand-800">Pending entries</h2>
            <div className="mt-2 space-y-2">
              {queueQuery.data?.entries.map((entry) => (
                <article key={entry.id} className="rounded-md border border-brand-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-brand-800">{entry.headword}</p>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => approveEntryMutation.mutate(entry.id)}>
                      Approve
                    </Button>
                    <Button type="button" variant="danger" onClick={() => rejectEntryMutation.mutate(entry.id)}>
                      Reject
                    </Button>
                  </div>
                </article>
              ))}
              {queueQuery.data?.entries.length === 0 ? (
                <p className="text-sm text-slate-600">No pending entries.</p>
              ) : null}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-brand-800">Pending examples</h2>
            <div className="mt-2 space-y-2">
              {queueQuery.data?.examples.map((example) => (
                <article key={example.id} className="rounded-md border border-brand-100 p-3">
                  <p className="text-sm text-slate-800">{example.sentence_original}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => approveExampleMutation.mutate(example.id)}>
                      Approve
                    </Button>
                    <Button type="button" variant="danger" onClick={() => hideExampleMutation.mutate(example.id)}>
                      Hide
                    </Button>
                  </div>
                </article>
              ))}
              {queueQuery.data?.examples.length === 0 ? (
                <p className="text-sm text-slate-600">No pending examples.</p>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">Open reports</h2>
        <div className="mt-3 space-y-2">
          {reportsQuery.data?.map((report) => (
            <article key={report.id} className="rounded-md border border-brand-100 p-3">
              <p className="text-sm font-medium text-brand-800">
                {report.target_type} · {report.reason_code}
              </p>
              {report.free_text ? <p className="mt-1 text-sm text-slate-700">{report.free_text}</p> : null}
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge status={report.status === "dismissed" ? "rejected" : "pending"} />
                <Button type="button" onClick={() => resolveReportMutation.mutate(report.id)}>
                  Resolve
                </Button>
              </div>
            </article>
          ))}
          {reportsQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-600">No open reports.</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}
