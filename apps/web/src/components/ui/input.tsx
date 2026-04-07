import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-line-strong bg-surface-input px-3 py-2 text-sm text-ink",
        "focus:border-focus focus:outline-none focus:ring-2 focus:ring-surface-chip",
        className,
      )}
      {...props}
    />
  );
}
