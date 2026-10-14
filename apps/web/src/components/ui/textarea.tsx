import clsx from "clsx";
import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

import { normalizeTextInput } from "@/lib/text";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, onChange, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-line-strong bg-surface-input px-3 py-2 text-sm text-ink",
        "focus:border-focus focus:outline-none focus:ring-2 focus:ring-surface-chip",
        className,
      )}
      {...props}
      onChange={(event) => {
        normalizeTextInput(event.currentTarget);
        onChange?.(event);
      }}
    />
  ),
);

Textarea.displayName = "Textarea";
