import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

import { I18nProvider } from "@/i18n";
import { queryClient } from "@/lib/query-client";

interface Props {
  children: ReactNode;
}

export function AppProviders({ children }: Props) {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nProvider>
  );
}
