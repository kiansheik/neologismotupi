import { Link, useLocation } from "react-router-dom";

import { useI18n } from "@/i18n";

export function BrowseTabs() {
  const location = useLocation();
  const { t } = useI18n();
  const isExamples = location.pathname.startsWith("/examples");
  const isEntries = !isExamples;

  const baseClass =
    "rounded-full px-3 py-1 text-sm font-semibold transition-colors";
  const activeClass = "bg-brand-100 text-brand-900";
  const inactiveClass = "text-brand-700 hover:bg-accent hover:text-accent-contrast";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/entries"
        aria-current={isEntries ? "page" : undefined}
        className={`${baseClass} ${isEntries ? activeClass : inactiveClass}`}
      >
        {t("term.entriesCap")}
      </Link>
      <Link
        to="/examples"
        aria-current={isExamples ? "page" : undefined}
        className={`${baseClass} ${isExamples ? activeClass : inactiveClass}`}
      >
        {t("term.examplesCap")}
      </Link>
    </div>
  );
}
