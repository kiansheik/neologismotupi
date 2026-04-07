import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth/hooks";
import { updateMyPreferences } from "@/features/users/api";
import { useI18n } from "@/i18n";
import type { OrthographyMapItem } from "@/lib/types";
import { areMappingsEqual, normalizeOrthographyMapping, useOrthography } from "@/lib/orthography";

const EMPTY_ROW: OrthographyMapItem = { from: "", to: "" };

export function OrthographyMappingCard() {
  const { t } = useI18n();
  const { data: user } = useCurrentUser();
  const { mapping, setMapping } = useOrthography();
  const [draft, setDraft] = useState<OrthographyMapItem[]>(() => (mapping.length ? mapping : [EMPTY_ROW]));
  const [hasChanges, setHasChanges] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const normalizedDraft = useMemo(() => normalizeOrthographyMapping(draft), [draft]);

  useEffect(() => {
    if (hasChanges) {
      return;
    }
    setDraft(mapping.length ? mapping : [EMPTY_ROW]);
  }, [hasChanges, mapping]);

  const updateMutation = useMutation({
    mutationFn: updateMyPreferences,
    onSuccess: () => {
      setStatus("saved");
    },
    onError: () => {
      setStatus("error");
    },
  });

  const handleChange = (index: number, field: "from" | "to", value: string) => {
    setDraft((current) =>
      current.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
    );
    setHasChanges(true);
    setStatus("idle");
  };

  const handleAddRow = () => {
    setDraft((current) => [...current, { ...EMPTY_ROW }]);
    setHasChanges(true);
    setStatus("idle");
  };

  const handleRemoveRow = (index: number) => {
    setDraft((current) => {
      const next = current.filter((_, idx) => idx !== index);
      return next.length ? next : [{ ...EMPTY_ROW }];
    });
    setHasChanges(true);
    setStatus("idle");
  };

  const handleSave = () => {
    const cleaned = normalizedDraft;
    if (areMappingsEqual(cleaned, mapping)) {
      setHasChanges(false);
      setStatus("saved");
      return;
    }
    setMapping(cleaned);
    setHasChanges(false);
    setStatus("saved");
    if (user) {
      updateMutation.mutate({ orthography_map: cleaned });
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">{t("orthography.title")}</h2>
          <p className="mt-1 text-xs text-slate-600">{t("orthography.description")}</p>
        </div>
        <Button
            type="button"
            className="px-3 py-1.5 text-xs"
            onClick={handleSave}
            disabled={updateMutation.isPending || (!hasChanges && areMappingsEqual(normalizedDraft, mapping))}
          >
            {updateMutation.isPending ? t("orthography.saving") : t("orthography.save")}
          </Button>
      </div>

      <div className="mt-3 space-y-2">
        {draft.map((row, index) => (
          <div key={`orthography-row-${index}`} className="flex flex-wrap items-center gap-2">
            <div className="min-w-[120px] flex-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {t("orthography.fromLabel")}
              </label>
              <Input
                value={row.from}
                onChange={(event) => handleChange(index, "from", event.target.value)}
                placeholder={t("orthography.fromPlaceholder")}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {t("orthography.toLabel")}
              </label>
              <Input
                value={row.to}
                onChange={(event) => handleChange(index, "to", event.target.value)}
                placeholder={t("orthography.toPlaceholder")}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2 text-xs text-slate-600"
              onClick={() => handleRemoveRow(index)}
            >
              {t("orthography.removeRow")}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={handleAddRow}>
          {t("orthography.addRow")}
        </Button>
        <Button
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={handleSave}
          disabled={updateMutation.isPending || (!hasChanges && areMappingsEqual(normalizedDraft, mapping))}
        >
          {updateMutation.isPending ? t("orthography.saving") : t("orthography.save")}
        </Button>
      </div>

      {!user ? (
        <p className="mt-3 text-xs text-amber-700">{t("orthography.signInHint")}</p>
      ) : null}
      {status === "saved" ? (
        <p className="mt-2 text-xs text-emerald-700">{t("orthography.saved")}</p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 text-xs text-red-700">{t("orthography.saveError")}</p>
      ) : null}
    </Card>
  );
}
