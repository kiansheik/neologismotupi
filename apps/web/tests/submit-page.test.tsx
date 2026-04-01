import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SubmitPage } from "@/routes/submit-page";
import { renderWithProviders } from "./test-utils";

const { listEntriesMock, createEntryMock, getEntryConstraintsMock } = vi.hoisted(() => ({
  listEntriesMock: vi.fn(),
  createEntryMock: vi.fn(),
  getEntryConstraintsMock: vi.fn(),
}));
const { listSourcesMock } = vi.hoisted(() => ({
  listSourcesMock: vi.fn(),
}));
const { getPublicUserMock } = vi.hoisted(() => ({
  getPublicUserMock: vi.fn(),
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
  getEntryConstraints: getEntryConstraintsMock,
}));

vi.mock("@/features/sources/api", () => ({
  listSources: listSourcesMock,
}));

vi.mock("@/features/auth/api", () => ({
  getPublicUser: getPublicUserMock,
}));

describe("SubmitPage", () => {
  beforeEach(() => {
    listSourcesMock.mockResolvedValue([]);
    getEntryConstraintsMock.mockResolvedValue({
      entry_vote_cost: 3,
      downvote_requires_comment: false,
      downvote_comment_min_length: 5,
      downvote_comment_exempt_staff: false,
      entry_vote_cost_exempt_staff: false,
    });
    getPublicUserMock.mockResolvedValue({
      id: "u1",
      created_at: "2026-01-01T00:00:00Z",
      profile: {
        id: "profile-1",
        display_name: "Teste",
        stats: {
          total_entries: 0,
          entry_vote_cost_entries: 0,
          total_comments: 0,
          total_entry_votes: 3,
          entry_vote_cost_votes: 3,
          last_seen_at: "2026-01-01T00:00:00Z",
          last_active_at: "2026-01-01T00:00:00Z",
          submitting_since_at: "2026-01-01T00:00:00Z",
        },
      },
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
