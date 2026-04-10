import { screen } from "@testing-library/react";

import { GamesPage } from "@/routes/games-page";
import { renderWithProviders } from "./test-utils";

const { authState } = vi.hoisted(() => ({
  authState: { currentUser: undefined as unknown },
}));

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser }),
}));

vi.mock("@/features/flashcards/hooks", () => ({
  useFlashcardStats: () => ({ data: { last_7_days: [] } }),
}));

describe("GamesPage", () => {
  it("renders games landing content and flashcards card", () => {
    authState.currentUser = undefined;

    renderWithProviders(<GamesPage />);

    expect(screen.getByText("Jogos")).toBeInTheDocument();
    expect(screen.getByText("Flashcards")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Começar" })).toBeInTheDocument();
  });
});
