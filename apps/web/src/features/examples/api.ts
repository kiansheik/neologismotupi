import { apiFetch } from "@/lib/api";

export interface ReportExamplePayload {
  reason_code: string;
  free_text?: string;
}

export interface ExampleVotePayload {
  value: -1 | 1;
}

export function reportExample(exampleId: string, payload: ReportExamplePayload) {
  return apiFetch(`/examples/${exampleId}/reports`, { method: "POST", body: payload });
}

export function updateExample(exampleId: string, payload: Record<string, string>) {
  return apiFetch(`/examples/${exampleId}`, { method: "PATCH", body: payload });
}

export function voteExample(exampleId: string, payload: ExampleVotePayload) {
  return apiFetch<{ score_cache: number }>(`/examples/${exampleId}/vote`, {
    method: "POST",
    body: payload,
  });
}

export function deleteExampleVote(exampleId: string) {
  return apiFetch<void>(`/examples/${exampleId}/vote`, { method: "DELETE" });
}
