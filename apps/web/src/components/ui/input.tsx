import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

import { normalizeTextInput } from "@/lib/text";

export function Input({ className, onChange, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-line-strong bg-surface-input px-3 py-2 text-sm text-ink",
        "focus:border-focus focus:outline-none focus:ring-2 focus:ring-surface-chip",
        className,
      )}
      {...props}
      type={type}
      onChange={(event) => {
        if (type === "text" || type === "search") {
          normalizeTextInput(event.currentTarget);
        }
        onChange?.(event);
      }}
    />
  );
}
