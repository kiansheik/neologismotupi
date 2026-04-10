import { screen } from "@testing-library/react";

import { FlashcardListDetailPage } from "@/routes/flashcard-list-detail-page";
import { renderWithRoute } from "./test-utils";

const { authState } = vi.hoisted(() => ({
  authState: { currentUser: undefined as unknown },
}));

vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser }),
}));

vi.mock("@/features/flashcard-lists/hooks", () => ({
  useFlashcardListDetail: () => ({
    data: {
      list: {
        id: "list-1",
        owner: { id: "u1", display_name: "Author", reputation_score: 0, badges: [] },
        title_pt: "Lista de teste",
        title_en: null,
        description_pt: "Descrição",
        description_en: null,
        theme_label: "tema",
        is_public: true,
        score_cache: 2,
        upvote_count_cache: 2,
        downvote_count_cache: 0,
        item_count_cache: 1,
        current_user_vote: null,
        contains_entry: null,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
      },
      items: [
        {
          id: "entry-1",
          slug: "entry-one",
          headword: "abare",
          normalized_headword: "abare",
          gloss_pt: "padre",
          gloss_en: null,
          part_of_speech: "noun",
          short_definition: "uma definicao",
          status: "approved",
          score_cache: 0,
          upvote_count_cache: 0,
          downvote_count_cache: 0,
          example_count_cache: 0,
          proposer_user_id: "u1",
          proposer: { id: "u1", display_name: "Author", reputation_score: 0, badges: [] },
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          tags: [],
        },
      ],
      page: 1,
      page_size: 40,
      total: 1,
    },
    isLoading: false,
  }),
  useFlashcardListComments: () => ({ data: { items: [], total: 0 }, isLoading: false }),
  useVoteFlashcardList: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateFlashcardListComment: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("FlashcardListDetailPage", () => {
  it("renders list title and entries", () => {
    authState.currentUser = null;

    renderWithRoute(
      <FlashcardListDetailPage />,
      "/lists/:listId",
      "/lists/list-1",
    );

    expect(screen.getByText("Lista de teste")).toBeInTheDocument();
    expect(screen.getByText("abare")).toBeInTheDocument();
  });
});
