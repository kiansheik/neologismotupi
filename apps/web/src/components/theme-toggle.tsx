import { useI18n } from "@/i18n";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface-input px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-hover"
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      onClick={toggleTheme}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t("theme.label")}</span>
      <span className="text-xs font-medium text-brand-800">{isDark ? t("theme.dark") : t("theme.light")}</span>
    </button>
  );
}
