import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SubmitPage } from "@/routes/submit-page";
import { renderWithProviders } from "./test-utils";

const { listEntriesMock, createEntryMock, getEntrySubmissionGateMock } = vi.hoisted(() => ({
  listEntriesMock: vi.fn(),
  createEntryMock: vi.fn(),
  getEntrySubmissionGateMock: vi.fn(),
}));
const { listSourcesMock } = vi.hoisted(() => ({
  listSourcesMock: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({
    data: {
      id: "u1",
      email: "u@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    },
  }),
}));

vi.mock("@/features/entries/api", () => ({
  listEntries: listEntriesMock,
  createEntry: createEntryMock,
  getEntrySubmissionGate: getEntrySubmissionGateMock,
}));

vi.mock("@/features/sources/api", () => ({
  listSources: listSourcesMock,
}));

describe("SubmitPage", () => {
  beforeEach(() => {
    listSourcesMock.mockResolvedValue([]);
    getEntrySubmissionGateMock.mockResolvedValue({
      window_start: "2026-04-01T00:00:00Z",
      window_end: "2026-04-02T00:00:00Z",
      votes_today: 3,
      entries_today: 0,
      unlocked_posts: 1,
      remaining_posts: 1,
      unlimited: false,
      next_votes_required: 2,
      votes_required_for_unlimited: 6,
      step1_votes: 3,
      step1_posts: 1,
      step2_votes: 5,
      step2_posts: 4,
      step3_votes: 6,
    });
    listEntriesMock.mockResolvedValue({
      items: [
        {
          id: "dupe-1",
          slug: "possible-duplicate",
          headword: "possible duplicate",
          normalized_headword: "possible duplicate",
          gloss_pt: "existing",
          gloss_en: "existing",
          part_of_speech: "noun",
          short_definition: "existing definition",
          status: "approved",
          score_cache: 1,
          upvote_count_cache: 1,
          downvote_count_cache: 0,
          example_count_cache: 1,
          proposer_user_id: "u1",
          proposer: { id: "u1", display_name: "Existing User", reputation_score: 0 },
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          tags: [],
        },
      ],
      page: 1,
      page_size: 5,
      total: 1,
    });
  });

  it("shows duplicate warning as user types", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmitPage />);

    const headwordInput = await screen.findByLabelText(/Verbete/i);
    await user.type(headwordInput, "new");

    await waitFor(() => {
      expect(screen.getByTestId("duplicate-warning")).toBeInTheDocument();
    });
  });

  it("keeps duplicate warning visible when duplicate headword is an exact match", async () => {
    listEntriesMock.mockImplementation(async (params: { search?: string }) => {
      if (params.search === "mba'eoby") {
        return {
          items: [
            {
              id: "dupe-exact-1",
              slug: "mba-eoby",
              headword: "mba'eoby",
              normalized_headword: "mba'eoby",
              gloss_pt: "Neologismo",
              gloss_en: null,
              part_of_speech: "noun",
              short_definition: "Neologismo",
              status: "approved",
              score_cache: 2,
              upvote_count_cache: 2,
              downvote_count_cache: 0,
              example_count_cache: 0,
              proposer_user_id: "u1",
              proposer: { id: "u1", display_name: "Existing User", reputation_score: 0 },
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              tags: [],
            },
          ],
          page: 1,
          page_size: 5,
          total: 1,
        };
      }

      return {
        items: [],
        page: 1,
        page_size: 5,
        total: 0,
      };
    });

    const user = userEvent.setup();
    renderWithProviders(<SubmitPage />);

    const headwordInput = await screen.findByLabelText(/Verbete/i);
    await user.type(headwordInput, "mba'eoby");

    await waitFor(() => {
      expect(screen.getByTestId("duplicate-warning")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "mba'eoby" })).toBeInTheDocument();
    });
  });
});
