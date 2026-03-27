import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { unsubscribeNewsletter } from "@/features/newsletters/api";
import { useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { ApiError } from "@/lib/api";

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const token = searchParams.get("token") ?? "";
  const hasTriggered = useRef(false);

  const unsubscribeMutation = useMutation({
    mutationFn: unsubscribeNewsletter,
    onSuccess: () => {
      trackEvent("newsletter_unsubscribe_success");
    },
    onError: (error) => {
      trackEvent("newsletter_unsubscribe_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  useEffect(() => {
    if (!token || hasTriggered.current) {
      return;
    }
    hasTriggered.current = true;
    unsubscribeMutation.mutate(token);
  }, [token, unsubscribeMutation]);

  let statusMessage = "";
  if (!token) {
    statusMessage = t("unsubscribe.missingToken");
  } else if (unsubscribeMutation.isPending) {
    statusMessage = t("unsubscribe.processing");
  } else if (unsubscribeMutation.isSuccess) {
    statusMessage = t("unsubscribe.success");
  } else if (unsubscribeMutation.isError) {
    statusMessage = t("unsubscribe.error");
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold text-brand-900">
        {t("unsubscribe.title")}
      </h1>
      <p className="mt-2 text-sm text-slate-700">
        {t("unsubscribe.description")}
      </p>
      {statusMessage ? (
        <p
          className={`mt-3 text-sm ${
            unsubscribeMutation.isError ? "text-red-700" : "text-slate-700"
          }`}
        >
          {statusMessage}
        </p>
      ) : null}
      <div className="mt-4">
        <Link to="/">
          <Button type="button" variant="secondary">
            {t("unsubscribe.backHome")}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
