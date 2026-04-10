import { screen } from "@testing-library/react";

import { FlashcardListsPage } from "@/routes/flashcard-lists-page";
import { renderWithProviders } from "./test-utils";

const { authState } = vi.hoisted(() => ({
  authState: { currentUser: undefined as unknown },
}));

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser }),
}));

vi.mock("@/features/flashcard-lists/hooks", () => ({
  useFlashcardLists: () => ({ data: { items: [], total: 0 }, isLoading: false }),
  useCreateFlashcardList: () => ({ mutate: vi.fn(), isPending: false }),
  useVoteFlashcardList: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("FlashcardListsPage", () => {
  it("renders list landing for logged-out users", () => {
    authState.currentUser = null;

    renderWithProviders(<FlashcardListsPage />);

    expect(screen.getByText("Listas de flashcards")).toBeInTheDocument();
    expect(screen.getByText("Entre para criar sua própria lista.")).toBeInTheDocument();
  });
});
