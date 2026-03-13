import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SubmitPage } from "@/routes/submit-page";
import { renderWithProviders } from "./test-utils";

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
  listEntries: vi.fn().mockResolvedValue({
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
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        tags: [],
      },
    ],
    page: 1,
    page_size: 5,
    total: 1,
  }),
  createEntry: vi.fn(),
}));

describe("SubmitPage", () => {
  it("shows duplicate warning as user types", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmitPage />);

    const headwordInput = screen.getByLabelText("Headword");
    await user.type(headwordInput, "new");

    await waitFor(() => {
      expect(screen.getByTestId("duplicate-warning")).toBeInTheDocument();
    });
  });
});
