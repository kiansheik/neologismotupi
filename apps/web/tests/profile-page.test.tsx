import { screen } from "@testing-library/react";

import { ProfilePage } from "@/routes/profile-page";
import { renderWithRoute } from "./test-utils";

vi.mock("@/features/auth/api", () => ({
  getPublicUser: vi.fn().mockResolvedValue({
    id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    profile: {
      id: "profile-1",
      display_name: "Uyrauna",
      bio: "Bio de teste",
      affiliation_label: "Academia",
      role_label: "Membro",
      website_url: "academiatupi.com",
      instagram_handle: "@uyrauna",
      tiktok_handle: null,
      youtube_handle: null,
      bluesky_handle: "uyrauna.bsky.social",
      reputation_score: 4,
      badges: ["founder"],
      stats: {
        total_entries: 12,
        entry_vote_cost_entries: 12,
        total_comments: 7,
        total_entry_votes: 0,
        entry_vote_cost_votes: 0,
        last_seen_at: "2026-03-14T10:00:00Z",
        last_active_at: "2026-03-14T09:00:00Z",
        submitting_since_at: "2026-01-10T00:00:00Z",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-03-14T10:00:00Z",
    },
  }),
}));

vi.mock("@/features/entries/api", () => ({
  listEntries: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    page_size: 50,
    total: 0,
  }),
}));

describe("ProfilePage", () => {
  it("renders profile stats, badge labels, and social links", async () => {
    renderWithRoute(<ProfilePage />, "/profiles/:userId", "/profiles/user-1");

    expect(await screen.findByText("Uyrauna")).toBeInTheDocument();
    expect(screen.getByText("Fundador construtor")).toBeInTheDocument();
    expect(screen.getByText("Total de verbetes")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    const instagramLink = screen.getByRole("link", { name: /Instagram:/i });
    expect(instagramLink).toHaveAttribute("href", "https://www.instagram.com/uyrauna");
  });
});
