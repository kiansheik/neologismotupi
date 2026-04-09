import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FlashcardsPage } from "@/routes/flashcards-page";
import { renderWithProviders } from "./test-utils";

const {
  authState,
  getFlashcardSessionMock,
  submitFlashcardReviewMock,
  updateFlashcardSettingsMock,
  finishFlashcardSessionMock,
  updateFlashcardPresenceMock,
  getFlashcardStatsMock,
  getFlashcardLeaderboardMock,
} = vi.hoisted(() => ({
  authState: { currentUser: undefined as unknown },
  getFlashcardSessionMock: vi.fn(),
  submitFlashcardReviewMock: vi.fn(),
  updateFlashcardSettingsMock: vi.fn(),
  finishFlashcardSessionMock: vi.fn(),
  updateFlashcardPresenceMock: vi.fn(),
  getFlashcardStatsMock: vi.fn(),
  getFlashcardLeaderboardMock: vi.fn(),
}));

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser, isLoading: false }),
}));

vi.mock("@/features/flashcards/api", () => ({
  getFlashcardSession: getFlashcardSessionMock,
  submitFlashcardReview: submitFlashcardReviewMock,
  updateFlashcardSettings: updateFlashcardSettingsMock,
  finishFlashcardSession: finishFlashcardSessionMock,
  updateFlashcardPresence: updateFlashcardPresenceMock,
  getFlashcardStats: getFlashcardStatsMock,
  getFlashcardLeaderboard: getFlashcardLeaderboardMock,
}));

describe("FlashcardsPage", () => {
  beforeEach(() => {
    getFlashcardSessionMock.mockResolvedValue({
      settings: { new_cards_per_day: 3, advanced_grading_enabled: false },
      summary: {
        new_remaining: 2,
        review_remaining: 1,
        completed_today: 0,
        due_now: 3,
        due_later_today: 0,
      },
      current_card: {
        entry_id: "entry-1",
        direction: "headword_to_gloss",
        queue: "new",
        slug: "entry-one",
        headword: "abare",
        gloss_pt: "padre",
        short_definition: "uma definicao",
        part_of_speech: "noun",
      },
      active_session: null,
    });
    submitFlashcardReviewMock.mockResolvedValue({
      summary: {
        new_remaining: 1,
        review_remaining: 1,
        completed_today: 1,
        due_now: 2,
        due_later_today: 0,
      },
      next_card: null,
      active_session: null,
    });
    updateFlashcardSettingsMock.mockResolvedValue({ new_cards_per_day: 5, advanced_grading_enabled: false });
    finishFlashcardSessionMock.mockResolvedValue(null);
    updateFlashcardPresenceMock.mockResolvedValue(null);
    getFlashcardStatsMock.mockResolvedValue({
      today: {
        date: "2026-04-01",
        reviews: 4,
        new_seen: 2,
        study_minutes: 20,
        sessions: 1,
      },
      last_7_days: [
        { date: "2026-03-26", reviews: 0, new_seen: 0, study_minutes: 0, sessions: 0 },
        { date: "2026-03-27", reviews: 3, new_seen: 1, study_minutes: 10, sessions: 1 },
        { date: "2026-03-28", reviews: 2, new_seen: 1, study_minutes: 5, sessions: 1 },
        { date: "2026-03-29", reviews: 5, new_seen: 2, study_minutes: 15, sessions: 1 },
        { date: "2026-03-30", reviews: 1, new_seen: 0, study_minutes: 3, sessions: 1 },
        { date: "2026-03-31", reviews: 4, new_seen: 2, study_minutes: 12, sessions: 1 },
        { date: "2026-04-01", reviews: 4, new_seen: 2, study_minutes: 20, sessions: 1 },
      ],
    });
    getFlashcardLeaderboardMock.mockResolvedValue({ entries: [] });
  });

  it("shows auth CTA when logged out", () => {
    authState.currentUser = null;

    renderWithProviders(<FlashcardsPage />);

    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar conta" })).toBeInTheDocument();
  });

  it("types a correct answer and submits review", async () => {
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

    const input = screen.getByPlaceholderText("Sua resposta...");
    await user.type(input, "padre");

    const submitButton = screen.getByRole("button", { name: "Enviar" });
    await user.click(submitButton);

    // Should show Congrats since "padre" matches exactly
    const continueButton = await screen.findByRole("button", { name: "Parabéns!" });
    await user.click(continueButton);

    await waitFor(() => {
      expect(submitFlashcardReviewMock).toHaveBeenCalled();
    });
    const payload = submitFlashcardReviewMock.mock.calls[0][0];
    expect(payload.entry_id).toBe("entry-1");
    expect(payload.grade).toBe("good");
    expect(payload.user_response).toBe("padre");
  });

  it("types an incorrect answer and gets study-more grade", async () => {
    authState.currentUser = {
      id: "u4",
      email: "u4@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    };

    getFlashcardSessionMock.mockResolvedValueOnce({
      settings: { new_cards_per_day: 3, advanced_grading_enabled: false },
      summary: {
        new_remaining: 1,
        review_remaining: 0,
        completed_today: 0,
        due_now: 1,
        due_later_today: 0,
      },
      current_card: {
        entry_id: "entry-2",
        direction: "headword_to_gloss",
        queue: "review",
        slug: "entry-two",
        headword: "taba",
        gloss_pt: "aldeia",
        short_definition: "uma definicao",
        part_of_speech: "noun",
      },
      active_session: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<FlashcardsPage />);

    const input = await screen.findByPlaceholderText("Sua resposta...");
    await user.type(input, "completamente errado xyz");

    const submitButton = screen.getByRole("button", { name: "Enviar" });
    await user.click(submitButton);

    // Should show Study More since the answer is wrong
    const continueButton = await screen.findByRole("button", { name: "Estudar mais" });
    await user.click(continueButton);

    await waitFor(() => {
      expect(submitFlashcardReviewMock).toHaveBeenCalled();
    });

    const payload = submitFlashcardReviewMock.mock.calls[0][0];
    expect(payload.grade).toBe("again");
  });

  it("finishes a session when requested", async () => {
    authState.currentUser = {
      id: "u3",
      email: "u3@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    };

    getFlashcardSessionMock.mockResolvedValueOnce({
      settings: { new_cards_per_day: 3, advanced_grading_enabled: false },
      summary: {
        new_remaining: 1,
        review_remaining: 0,
        completed_today: 1,
        due_now: 1,
        due_later_today: 0,
      },
      current_card: null,
      active_session: {
        id: "session-1",
        started_at: "2026-04-01T12:00:00Z",
        elapsed_seconds: 300,
        review_count: 2,
        is_paused: false,
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<FlashcardsPage />);

    const finishButton = await screen.findByRole("button", { name: "Finalizar sessão" });
    await user.click(finishButton);

    await waitFor(() => {
      expect(finishFlashcardSessionMock).toHaveBeenCalled();
    });
  });
});
