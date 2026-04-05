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
