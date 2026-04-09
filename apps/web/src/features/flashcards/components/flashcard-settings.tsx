import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";

interface FlashcardSettingsProps {
  isSaving?: boolean;
  advancedEnabled?: boolean;
  onToggleAdvanced?: (value: boolean) => void;
}

export function FlashcardSettings({
  isSaving = false,
  advancedEnabled = false,
  onToggleAdvanced,
}: FlashcardSettingsProps) {
  const { t } = useI18n();

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
        {t("flashcards.settings.title")}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{t("flashcards.settings.advancedOnly")}</p>
      {onToggleAdvanced ? (
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={advancedEnabled}
              disabled={isSaving}
              className="h-4 w-4 rounded border-line-strong accent-brand-600"
              onChange={(event) => onToggleAdvanced(event.target.checked)}
            />
            {t("flashcards.settings.advancedLabel")}
          </label>
          <p className="mt-1 text-xs text-ink-muted">{t("flashcards.settings.advancedHint")}</p>
        </div>
      ) : null}
      {isSaving ? (
        <p className="mt-3 text-xs text-ink-muted">{t("flashcards.settings.saving")}</p>
      ) : null}
    </Card>
  );
}
