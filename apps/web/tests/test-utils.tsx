import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { I18nProvider } from "@/i18n";
import { OrthographyProvider } from "@/lib/orthography";

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <I18nProvider>
      <OrthographyProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>{ui}</MemoryRouter>
        </QueryClientProvider>
      </OrthographyProvider>
    </I18nProvider>,
  );
}

export function renderWithRoute(ui: ReactElement, path: string, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <I18nProvider>
      <OrthographyProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </OrthographyProvider>
    </I18nProvider>,
  );
}
