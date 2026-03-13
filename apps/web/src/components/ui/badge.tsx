import clsx from "clsx";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  tone?: "neutral" | "pending" | "approved" | "danger" | "disputed";
}

export function Badge({ children, tone = "neutral" }: Props) {
  return (
    <span
      className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", {
        "bg-slate-200 text-slate-700": tone === "neutral",
        "bg-amber-100 text-amber-800": tone === "pending",
        "bg-green-100 text-green-800": tone === "approved",
        "bg-red-100 text-red-800": tone === "danger",
        "bg-orange-100 text-orange-900": tone === "disputed",
      })}
    >
      {children}
    </span>
  );
}
