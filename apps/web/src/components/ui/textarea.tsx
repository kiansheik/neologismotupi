import clsx from "clsx";
import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-line-strong bg-surface-input px-3 py-2 text-sm text-ink",
        "focus:border-focus focus:outline-none focus:ring-2 focus:ring-surface-chip",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
