import { apiFetch, withQuery } from "@/lib/api";
import type { ModerationQueue, ModerationReport } from "@/lib/types";

export function getModerationQueue() {
  return apiFetch<ModerationQueue>("/mod/queue");
}

export function getModerationReports(status = "open") {
  return apiFetch<ModerationReport[]>(withQuery("/mod/reports", { status }));
}

export function approveEntry(entryId: string, notes = "") {
  return apiFetch(`/mod/entries/${entryId}/approve`, {
    method: "POST",
    body: { notes, reason: "approved" },
  });
}

export function rejectEntry(entryId: string, notes = "") {
  return apiFetch(`/mod/entries/${entryId}/reject`, {
    method: "POST",
    body: { notes, reason: "rejected" },
  });
}

export function disputeEntry(entryId: string, notes = "") {
  return apiFetch(`/mod/entries/${entryId}/dispute`, {
    method: "POST",
    body: { notes, reason: "disputed" },
  });
}

export function approveExample(exampleId: string, notes = "") {
  return apiFetch(`/mod/examples/${exampleId}/approve`, {
    method: "POST",
    body: { notes, reason: "approved" },
  });
}

export function hideExample(exampleId: string, notes = "") {
  return apiFetch(`/mod/examples/${exampleId}/hide`, {
    method: "POST",
    body: { notes, reason: "hidden" },
  });
}

export function resolveReport(reportId: string, notes = "") {
  return apiFetch(`/mod/reports/${reportId}/resolve`, {
    method: "POST",
    body: { status: "resolved", notes },
  });
}
