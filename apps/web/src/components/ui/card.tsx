import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-line-soft bg-[linear-gradient(145deg,rgb(var(--surface-card-from)/1)_0%,rgb(var(--surface-card-to)/1)_100%)] p-4 shadow-[var(--card-shadow)]",
        className,
      )}
      {...props}
    />
  );
}
