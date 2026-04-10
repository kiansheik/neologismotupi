import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EntryDetailPage } from "@/routes/entry-detail-page";
import { renderWithRoute } from "./test-utils";

const {
  voteEntryMock,
  updateEntryMock,
  getEntryMock,
  createCommentMock,
  voteCommentMock,
  updateCommentMock,
  listCommentVersionsMock,
  listMentionUsersMock,
  resolveMentionUsersMock,
  authState,
} = vi.hoisted(() => ({
  voteEntryMock: vi.fn().mockResolvedValue({ score_cache: 1 }),
  updateEntryMock: vi.fn().mockResolvedValue({}),
  createCommentMock: vi.fn().mockResolvedValue({}),
  voteCommentMock: vi.fn().mockResolvedValue({ score_cache: 1 }),
  updateCommentMock: vi.fn().mockResolvedValue({}),
  listCommentVersionsMock: vi.fn().mockResolvedValue([]),
  listMentionUsersMock: vi.fn().mockResolvedValue([]),
  resolveMentionUsersMock: vi.fn().mockResolvedValue([]),
  getEntryMock: vi.fn().mockResolvedValue({
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
    proposer_user_id: "u1",
    proposer: { id: "u1", display_name: "Author", reputation_score: 0 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    morphology_notes: null,
    approved_at: null,
    approved_by_user_id: null,
    tags: [],
    versions: [],
    examples: [],
    comments: [],
  }),
  authState: { currentUser: undefined as unknown },
}));

vi.mock("@/features/entries/api", () => ({
  getEntry: getEntryMock,
  voteEntry: voteEntryMock,
  updateEntry: updateEntryMock,
  reportEntry: vi.fn(),
  createExample: vi.fn(),
}));

vi.mock("@/features/examples/api", () => ({
  reportExample: vi.fn(),
}));
vi.mock("@/features/comments/api", () => ({
  createComment: createCommentMock,
  voteComment: voteCommentMock,
  updateComment: updateCommentMock,
  listCommentVersions: listCommentVersionsMock,
}));
vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: authState.currentUser }),
}));
vi.mock("@/features/users/api", () => ({
  listMentionUsers: listMentionUsersMock,
  resolveMentionUsers: resolveMentionUsersMock,
}));

describe("EntryDetailPage", () => {
  beforeEach(() => {
    listMentionUsersMock.mockResolvedValue([]);
    resolveMentionUsersMock.mockResolvedValue([]);
    updateCommentMock.mockResolvedValue({});
    listCommentVersionsMock.mockResolvedValue([]);
  });

  it("shows sign-in prompt for logged-out users", async () => {
    authState.currentUser = undefined;

    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    const prompts = await screen.findAllByText(/Entre para votar, denunciar ou adicionar exemplos/i);
    expect(prompts.length).toBeGreaterThan(0);
  });

  it("calls vote endpoint when clicking vote button", async () => {
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
    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    const upvote = await screen.findByRole("button", { name: "Voto positivo" });
    await user.click(upvote);

    expect(voteEntryMock).toHaveBeenCalledWith("entry-1", { value: 1 });
  });

  it("lets moderators edit and save entries", async () => {
    authState.currentUser = {
      id: "mod-1",
      email: "mod@example.com",
      is_active: true,
      is_verified: true,
      is_superuser: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      profile: null,
    };

    const user = userEvent.setup();
    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    await user.click(await screen.findByRole("button", { name: "Editar verbete" }));
    await user.clear(screen.getByLabelText(/Verbete/i));
    await user.type(screen.getByLabelText(/Verbete/i), "entry one edited");
    await user.type(screen.getByLabelText(/Resumo da edição/i), "Ajuste de revisão");

    await user.click(screen.getByRole("button", { name: "Salvar edição" }));

    expect(updateEntryMock).toHaveBeenCalledWith(
      "entry-1",
      expect.objectContaining({
        headword: "entry one edited",
        edit_summary: "Ajuste de revisão",
      }),
    );
  });

  it("does not repeat gloss when gloss and definition are equivalent", async () => {
    authState.currentUser = undefined;
    getEntryMock.mockResolvedValueOnce({
      id: "entry-2",
      slug: "entry-two",
      headword: "Nhe'embysasu",
      normalized_headword: "nhe embysasu",
      gloss_pt: "Neologismo",
      gloss_en: null,
      part_of_speech: "noun",
      short_definition: "Neologismo.",
      status: "approved",
      score_cache: 0,
      upvote_count_cache: 0,
      downvote_count_cache: 0,
      example_count_cache: 0,
      proposer_user_id: "u2",
      proposer: { id: "u2", display_name: "Author 2", reputation_score: 0 },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      morphology_notes: null,
      approved_at: null,
      approved_by_user_id: null,
      tags: [],
      versions: [],
      examples: [],
      comments: [],
    });

    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-two");

    expect(await screen.findByText("Neologismo.")).toBeInTheDocument();
    expect(screen.queryByText("Neologismo")).not.toBeInTheDocument();
  });

  it("shows version and moderation events with author and timestamp in history", async () => {
    authState.currentUser = undefined;
    getEntryMock.mockResolvedValueOnce({
      id: "entry-3",
      slug: "entry-three",
      headword: "entry three",
      normalized_headword: "entry three",
      gloss_pt: "teste",
      gloss_en: null,
      part_of_speech: "noun",
      short_definition: "definição teste",
      status: "approved",
      score_cache: 0,
      upvote_count_cache: 0,
      downvote_count_cache: 0,
      example_count_cache: 0,
      proposer_user_id: "u3",
      proposer: { id: "u3", display_name: "Author 3", reputation_score: 0 },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      morphology_notes: null,
      approved_at: null,
      approved_by_user_id: null,
      tags: [],
      versions: [],
      history_events: [
        {
          id: "v1",
          kind: "version",
          version_number: 1,
          action_type: null,
          summary: "Initial submission",
          actor_user_id: "u3",
          actor_display_name: "Romildo",
          created_at: "2026-03-14T10:00:00Z",
        },
        {
          id: "m1",
          kind: "moderation",
          version_number: null,
          action_type: "entry_approved",
          summary: "good-faith",
          actor_user_id: "mod1",
          actor_display_name: "Moderator",
          created_at: "2026-03-15T10:00:00Z",
        },
      ],
      examples: [],
      comments: [],
    });

    const user = userEvent.setup();
    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-three");

    await user.click(await screen.findByText("Mostrar versões"));

    const historyItems = await screen.findAllByRole("listitem");
    expect(historyItems.some((item) => item.textContent?.includes("Initial submission"))).toBe(true);
    expect(historyItems.some((item) => item.textContent?.includes("por Romildo"))).toBe(true);
    expect(historyItems.some((item) => item.textContent?.includes("Verbete aprovado"))).toBe(true);
    expect(historyItems.some((item) => item.textContent?.includes("good-faith"))).toBe(true);
    expect(historyItems.some((item) => item.textContent?.includes("por Moderator"))).toBe(true);
  });

  it("autocompletes mentions when typing @ and pressing tab", async () => {
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
    listMentionUsersMock.mockResolvedValue([
      {
        id: "u-mention-1",
        display_name: "Mosco Monteiro",
        mention_handle: "moscomonteiro",
        profile_url: "/profiles/u-mention-1",
      },
    ]);

    const user = userEvent.setup();
    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-one");

    const textarea = await screen.findByPlaceholderText("Escreva seu comentário aqui...");
    await user.type(textarea, "@mos");

    await screen.findByRole("button", { name: /@moscomonteiro/i });
    await user.keyboard("{Tab}");

    await waitFor(() => {
      expect(listMentionUsersMock).toHaveBeenCalledWith("mos");
    });
    await waitFor(() => {
      expect(textarea).toHaveValue("@moscomonteiro ");
    });
  });

  it("renders @mentions in comments as profile links", async () => {
    authState.currentUser = undefined;
    resolveMentionUsersMock.mockResolvedValueOnce([
      {
        id: "u-mention-1",
        display_name: "Mosco Monteiro",
        mention_handle: "moscomonteiro",
        profile_url: "/profiles/u-mention-1",
      },
    ]);
    getEntryMock.mockResolvedValueOnce({
      id: "entry-mention",
      slug: "entry-mention",
      headword: "entry mention",
      normalized_headword: "entry mention",
      gloss_pt: "pt",
      gloss_en: null,
      part_of_speech: "noun",
      short_definition: "definition",
      status: "approved",
      score_cache: 0,
      upvote_count_cache: 0,
      downvote_count_cache: 0,
      example_count_cache: 0,
      proposer_user_id: "u1",
      proposer: { id: "u1", display_name: "Author", reputation_score: 0 },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      morphology_notes: null,
      approved_at: null,
      approved_by_user_id: null,
      tags: [],
      versions: [],
      examples: [],
      comments: [
        {
          id: "comment-1",
          entry_id: "entry-mention",
          user_id: "u2",
          parent_comment_id: null,
          body: "Vale revisar com @moscomonteiro.",
          score_cache: 0,
          upvote_count_cache: 0,
          downvote_count_cache: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          author: { id: "u2", display_name: "Comentador", reputation_score: 0 },
        },
      ],
    });

    renderWithRoute(<EntryDetailPage />, "/entries/:slug", "/entries/entry-mention");

    const mentionLink = await screen.findByRole("link", { name: "@moscomonteiro" });
    expect(mentionLink).toHaveAttribute("href", "/profiles/u-mention-1");
  });
});
