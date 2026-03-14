import { apiFetch, withQuery } from "@/lib/api";
import type { ModerationDashboard, ModerationQueue, ModerationReport } from "@/lib/types";

interface ModerationDecisionPayload {
  reason?: string;
  notes?: string;
}

export function getModerationQueue() {
  return apiFetch<ModerationQueue>("/mod/queue");
}

export function getModerationDashboard() {
  return apiFetch<ModerationDashboard>("/mod/dashboard");
}

export function getModerationReports(status = "open") {
  return apiFetch<ModerationReport[]>(withQuery("/mod/reports", { status }));
}

export function approveEntry(entryId: string, payload: ModerationDecisionPayload = {}) {
  return apiFetch(`/mod/entries/${entryId}/approve`, {
    method: "POST",
    body: { notes: payload.notes ?? "", reason: payload.reason ?? "approved" },
  });
}

export function rejectEntry(entryId: string, payload: ModerationDecisionPayload = {}) {
  return apiFetch(`/mod/entries/${entryId}/reject`, {
    method: "POST",
    body: { notes: payload.notes ?? "", reason: payload.reason ?? "rejected" },
  });
}

export function disputeEntry(entryId: string, notes = "") {
  return apiFetch(`/mod/entries/${entryId}/dispute`, {
    method: "POST",
    body: { notes, reason: "disputed" },
  });
}

export function approveExample(exampleId: string, payload: ModerationDecisionPayload = {}) {
  return apiFetch(`/mod/examples/${exampleId}/approve`, {
    method: "POST",
    body: { notes: payload.notes ?? "", reason: payload.reason ?? "approved" },
  });
}

export function rejectExample(exampleId: string, payload: ModerationDecisionPayload = {}) {
  return apiFetch(`/mod/examples/${exampleId}/reject`, {
    method: "POST",
    body: { notes: payload.notes ?? "", reason: payload.reason ?? "rejected" },
  });
}

export function hideExample(exampleId: string, payload: ModerationDecisionPayload = {}) {
  return apiFetch(`/mod/examples/${exampleId}/hide`, {
    method: "POST",
    body: { notes: payload.notes ?? "", reason: payload.reason ?? "hidden" },
  });
}

export function resolveReport(reportId: string, notes = "") {
  return apiFetch(`/mod/reports/${reportId}/resolve`, {
    method: "POST",
    body: { status: "resolved", notes },
  });
}
