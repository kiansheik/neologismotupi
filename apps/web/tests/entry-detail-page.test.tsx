import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EntryDetailPage } from "@/routes/entry-detail-page";
import { renderWithRoute } from "./test-utils";

const voteEntryMock = vi.fn().mockResolvedValue({ score_cache: 1 });
let mockUser: unknown;

vi.mock("@/features/entries/api", () => ({
  getEntry: vi.fn().mockResolvedValue({
    id: "entry-1",
    slug: "entry-one",
    headword: "entry one",
    normalized_headword: "entry one",
    gloss_pt: "pt",
    gloss_en: "en",
    part_of_speech: "noun",
    short_definition: "definition",
    status: "approved",
    score_cache: 0,
    upvote_count_cache: 0,
    downvote_count_cache: 0,
    example_count_cache: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    morphology_notes: null,
    approved_at: null,
    approved_by_user_id: null,
    tags: [],
    versions: [],
    examples: [],
  }),
  voteEntry: voteEntryMock,
  reportEntry: vi.fn(),
  createExample: vi.fn(),
}));

vi.mock("@/features/examples/api", () => ({
  reportExample: vi.fn(),
}));
vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: mockUser }),
}));

describe("EntryDetailPage", () => {
  it("shows sign-in prompt for logged-out users", async () => {
    mockUser = undefined;

    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    expect(await screen.findByText(/Sign in to vote, report, or add examples/i)).toBeInTheDocument();
  });

  it("calls vote endpoint when clicking vote button", async () => {
    mockUser = {
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
    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    const upvote = await screen.findByRole("button", { name: "Upvote" });
    await user.click(upvote);

    expect(voteEntryMock).toHaveBeenCalledWith("entry-1", { value: 1 });
  });
});
