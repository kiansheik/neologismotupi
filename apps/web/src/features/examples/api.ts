import { apiFetch } from "@/lib/api";

export interface ReportExamplePayload {
  reason_code: string;
  free_text?: string;
}

export function reportExample(exampleId: string, payload: ReportExamplePayload) {
  return apiFetch(`/examples/${exampleId}/reports`, { method: "POST", body: payload });
}

export function updateExample(exampleId: string, payload: Record<string, string>) {
  return apiFetch(`/examples/${exampleId}`, { method: "PATCH", body: payload });
}
