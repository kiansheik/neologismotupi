import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ZodError } from "zod";

export function applyZodErrors<TFieldValues extends FieldValues>(
  error: ZodError,
  setError: UseFormSetError<TFieldValues>,
): void {
  for (const issue of error.issues) {
    const path = issue.path.join(".") as Path<TFieldValues>;
    if (!path) {
      continue;
    }
    setError(path, { type: "manual", message: issue.message });
  }
}
