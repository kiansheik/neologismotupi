import { Link } from "react-router-dom";

import type { TranslateFn } from "@/i18n";

export function SourceCitation({
  citation,
  workId,
  firstUrl,
  t,
}: {
  citation: string;
  workId?: string | null;
  firstUrl?: string | null;
  t: TranslateFn;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {workId ? (
        <Link className="text-brand-700 hover:underline" to={`/sources/${workId}`}>
          {citation}
        </Link>
      ) : (
        <span>{citation}</span>
      )}
      {firstUrl ? (
        <a
          href={firstUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-700 hover:underline"
        >
          {t("entry.openMirror")}
        </a>
      ) : null}
    </span>
  );
}
