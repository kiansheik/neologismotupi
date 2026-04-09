import { useEffect } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/hooks";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";

export function GamesPage() {
  const { t } = useI18n();
  const { data: user } = useCurrentUser();

  useEffect(() => {
    trackEvent("games_page_view");
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-brand-900">{t("games.title")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("games.description")}</p>
        <p className="mt-2 text-xs text-ink-muted">{t("games.progressNote")}</p>
        {!user ? (
          <p className="mt-2 text-xs text-amber-700">{t("games.signInHint")}</p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-brand-900">{t("games.flashcards.title")}</p>
            <p className="mt-2 text-sm text-ink-muted">{t("games.flashcards.description")}</p>
          </div>
          <div>
            <Button asChild>
              <Link to="/games/flashcards">{t("games.flashcards.cta")}</Link>
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-lg font-semibold text-brand-900">{t("games.comingSoon.title")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("games.comingSoon.body")}</p>
        </Card>
      </div>
    </div>
  );
}
