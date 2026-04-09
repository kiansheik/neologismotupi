import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FlashcardsPage } from "@/routes/flashcards-page";
import { renderWithProviders } from "./test-utils";

const {
  authState,
  getFlashcardSessionMock,
  submitFlashcardReviewMock,
  updateFlashcardSettingsMock,
} = vi.hoisted(() => ({
  authState: { currentUser: undefined as unknown },
  getFlashcardSessionMock: vi.fn(),
  submitFlashcardReviewMock: vi.fn(),
  updateFlashcardSettingsMock: vi.fn(),
}));

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser, isLoading: false }),
}));

vi.mock("@/features/flashcards/api", () => ({
  getFlashcardSession: getFlashcardSessionMock,
  submitFlashcardReview: submitFlashcardReviewMock,
  updateFlashcardSettings: updateFlashcardSettingsMock,
}));

describe("FlashcardsPage", () => {
  beforeEach(() => {
    getFlashcardSessionMock.mockResolvedValue({
      settings: { new_cards_per_day: 3 },
      summary: {
        new_remaining: 2,
        review_remaining: 1,
        completed_today: 0,
        due_now: 3,
      },
      current_card: {
        entry_id: "entry-1",
        direction: "headword_to_gloss",
        queue_type: "new",
        slug: "entry-one",
        headword: "abare",
        gloss_pt: "padre",
        short_definition: "uma definicao",
        part_of_speech: "noun",
      },
    });
    submitFlashcardReviewMock.mockResolvedValue({
      summary: {
        new_remaining: 1,
        review_remaining: 1,
        completed_today: 1,
        due_now: 2,
      },
      next_card: null,
    });
    updateFlashcardSettingsMock.mockResolvedValue({ new_cards_per_day: 5 });
  });

  it("shows auth CTA when logged out", () => {
    authState.currentUser = null;

    renderWithProviders(<FlashcardsPage />);

    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toBeInTheDocument();
  });

  it("reveals and submits review", async () => {
    authState.currentUser = {
      id: "u1",
      email: "u@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    };

    const user = userEvent.setup();
    renderWithProviders(<FlashcardsPage />);

    expect(await screen.findByText("abare")).toBeInTheDocument();

    const revealButton = screen.getByRole("button", { name: "Revelar" });
    await user.click(revealButton);

    const correctButton = await screen.findByRole("button", { name: "Correto!" });
    await user.click(correctButton);

    await waitFor(() => {
      expect(submitFlashcardReviewMock).toHaveBeenCalled();
    });
    const payload = submitFlashcardReviewMock.mock.calls[0][0];
    expect(payload.entry_id).toBe("entry-1");
    expect(payload.result).toBe("correct");
  });

  it("updates settings from slider", async () => {
    authState.currentUser = {
      id: "u2",
      email: "u2@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    };

    renderWithProviders(<FlashcardsPage />);

    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "5" } });
    fireEvent.blur(slider);

    await waitFor(() => {
      expect(updateFlashcardSettingsMock).toHaveBeenCalledWith({ new_cards_per_day: 5 });
    });
  });
});
