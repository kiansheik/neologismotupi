import clsx from "clsx";
import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-[#d3c6b0] bg-[#fffaf2] px-3 py-2 text-sm",
        "focus:border-[#8a7246] focus:outline-none focus:ring-2 focus:ring-[#efe2c6]",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
