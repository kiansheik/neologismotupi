import clsx from "clsx";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-md border border-[#d3c6b0] bg-[#fffaf2] px-3 py-2 text-sm",
        "focus:border-[#8a7246] focus:outline-none focus:ring-2 focus:ring-[#efe2c6]",
        className,
      )}
      {...props}
    />
  );
}
