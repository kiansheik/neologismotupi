import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-brand-200 bg-white/90 p-4 shadow-sm backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
