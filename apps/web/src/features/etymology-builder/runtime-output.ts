export function extractVerbeteFromOutput(output?: string): string | null {
  if (!output) return null;
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("[stderr]"))
    .filter((line) => !line.startsWith("[error]"))
    .filter((line) => !line.toLowerCase().startsWith("error:"));

  if (lines.length === 0) return null;
  let candidate = lines[0];
  if (
    (candidate.startsWith("'") && candidate.endsWith("'")) ||
    (candidate.startsWith("\"") && candidate.endsWith("\""))
  ) {
    candidate = candidate.slice(1, -1);
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatRuntimeOutput(output?: string): string {
  if (!output) return "";
  const trimmed = output.trim();
  if (!trimmed) return "";
  if (trimmed.includes("\n")) return output;
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
  ) {
    return trimmed.slice(1, -1);
  }
  return output;
}
