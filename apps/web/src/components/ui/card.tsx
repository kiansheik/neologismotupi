import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-[#d9ccb5] bg-[linear-gradient(145deg,#fdf8ef_0%,#f8efde_100%)] p-4 shadow-[0_6px_20px_rgba(57,49,37,0.08)]",
        className,
      )}
      {...props}
    />
  );
}
