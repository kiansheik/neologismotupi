import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";

interface FlashcardSettingsProps {
  value: number;
  min?: number;
  max?: number;
  isSaving?: boolean;
  onCommit: (value: number) => void;
}

export function FlashcardSettings({
  value,
  min = 3,
  max = 20,
  isSaving = false,
  onCommit,
}: FlashcardSettingsProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft === value) {
      return;
    }
    onCommit(draft);
  };

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
        {t("flashcards.settings.title")}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{t("flashcards.settings.label")}</p>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{min}</span>
          <span className="text-sm font-semibold text-brand-900">{draft}</span>
          <span>{max}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={draft}
          disabled={isSaving}
          className="mt-2 w-full accent-brand-600"
          onChange={(event) => setDraft(Number(event.target.value))}
          onPointerUp={commit}
          onBlur={commit}
          onKeyUp={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              commit();
            }
          }}
        />
        {isSaving ? (
          <p className="mt-2 text-xs text-ink-muted">{t("flashcards.settings.saving")}</p>
        ) : null}
      </div>
    </Card>
  );
}
