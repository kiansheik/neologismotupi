import { screen } from "@testing-library/react";

import { EntriesPage } from "@/routes/entries-page";
import { renderWithProviders } from "./test-utils";

vi.mock("@/features/entries/api", () => ({
  listEntries: vi.fn().mockResolvedValue({
    items: [
      {
        id: "1",
        slug: "abare",
        headword: "abare",
        normalized_headword: "abare",
        gloss_pt: "teste",
        gloss_en: "test",
        part_of_speech: "noun",
        short_definition: "A sample definition",
        status: "approved",
        score_cache: 2,
        upvote_count_cache: 2,
        downvote_count_cache: 0,
        example_count_cache: 1,
        proposer_user_id: "user-1",
        proposer: { id: "user-1", display_name: "Test User" },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        tags: [],
      },
    ],
    page: 1,
    page_size: 50,
    total: 1,
  }),
}));

describe("EntriesPage", () => {
  it("renders entry list", async () => {
    renderWithProviders(<EntriesPage />);

    expect(await screen.findByText("abare")).toBeInTheDocument();
    expect(screen.getByTestId("entry-list")).toBeInTheDocument();
  });
});
