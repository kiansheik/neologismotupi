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
          "bg-accent text-accent-contrast hover:bg-accent-strong": variant === "primary",
          "bg-surface-input text-brand-800 ring-1 ring-line-strong hover:bg-surface-hover":
            variant === "secondary",
          "bg-red-700 text-white hover:bg-red-800": variant === "danger",
          "text-brand-700 hover:bg-surface-hover": variant === "ghost",
        },
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
