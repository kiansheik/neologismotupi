import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export function Button({ children, className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={clsx(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        {
          "bg-brand-700 text-white hover:bg-brand-800": variant === "primary",
          "bg-white text-brand-800 ring-1 ring-brand-300 hover:bg-brand-50": variant === "secondary",
          "bg-red-700 text-white hover:bg-red-800": variant === "danger",
          "text-brand-700 hover:bg-brand-100": variant === "ghost",
        },
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
