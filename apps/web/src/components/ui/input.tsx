import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-[#d3c6b0] bg-[#fffaf2] px-3 py-2 text-sm",
        "focus:border-[#8a7246] focus:outline-none focus:ring-2 focus:ring-[#efe2c6]",
        className,
      )}
      {...props}
    />
  );
}
