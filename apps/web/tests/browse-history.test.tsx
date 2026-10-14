import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { EntriesPage } from "@/routes/entries-page";
import { ExamplesPage } from "@/routes/examples-page";
import { I18nProvider } from "@/i18n";
import { OrthographyProvider } from "@/lib/orthography";
import { listEntries } from "@/features/entries/api";
import { listExamples } from "@/features/examples/api";
import {
  usePageState,
  useRestoreResultPages,
  writeNavigationState,
} from "@/lib/navigation-state";

const { auth } = vi.hoisted(() => ({ auth: { user: null as unknown } }));
vi.mock("@/features/auth/hooks", () => ({
  useCurrentUser: () => ({ data: auth.user }),
}));
vi.mock("@/features/entries/api", () => ({
  getEntryConstraints: vi.fn().mockResolvedValue({
    downvote_requires_comment: true,
    downvote_comment_min_length: 5,
  }),
  listEntries: vi.fn().mockResolvedValue({
    items: [
      {
        id: "one",
        slug: "abare",
        headword: "abare",
        gloss_pt: "padre",
        short_definition: "definição",
        status: "approved",
        score_cache: 0,
        upvote_count_cache: 0,
        downvote_count_cache: 0,
        example_count_cache: 0,
        proposer_user_id: "author",
        tags: [],
        proposer: { id: "author", display_name: "Author", reputation_score: 0 },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    page: 1,
    page_size: 50,
    total: 1,
  }),
  voteEntry: vi.fn(),
  reportCardEngagement: vi.fn(),
}));
vi.mock("@/features/examples/api", () => ({
  listExamples: vi
    .fn()
    .mockResolvedValue({ items: [], page: 1, page_size: 50, total: 0 }),
  voteExample: vi.fn(),
}));

function Controls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="url">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function mount(url = "/entries") {
  return render(
    <I18nProvider>
      <OrthographyProvider>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <MemoryRouter initialEntries={[url]}>
            <Controls />
            <Routes>
              <Route path="/entries" element={<EntriesPage />} />
              <Route path="/examples" element={<ExamplesPage />} />
              <Route path="/entries/:slug" element={<p>Result detail</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </OrthographyProvider>
    </I18nProvider>,
  );
}

function params() {
  return new URL(
    screen.getByTestId("url").textContent ?? "/",
    "https://example.com",
  ).searchParams;
}

describe("browse navigation", () => {
  beforeEach(() => {
    auth.user = null;
    vi.clearAllMocks();
  });

  it("opens shared searches with all filters and the canonical apostrophe", async () => {
    mount(
      "/entries?q=a%E2%80%99e&status=approved&part_of_speech=pronoun&sort=alphabetical",
    );
    expect(screen.getByRole("textbox")).toHaveValue("a'e");
    expect(
      screen.getByRole("combobox", { name: "Todos os status" }),
    ).toHaveValue("approved");
    expect(
      screen.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("pronoun");
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "alphabetical",
    );
    await waitFor(() =>
      expect(listEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "a'e",
          status: "approved",
          part_of_speech: "pronoun",
          sort: "alphabetical",
        }),
      ),
    );
  });

  it("restores filters after opening a result, with meaningful Back and Forward entries", async () => {
    mount("/entries?utm_source=shared");
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "tembi’u");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Todas as classes gramaticais" }),
      "noun",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ordenação" }),
      "alphabetical",
    );
    expect(params().get("q")).toBe("tembi'u");
    expect(params().get("utm_source")).toBe("shared");
    const searchUrl = screen.getByTestId("url").textContent;
    await user.click(await screen.findByRole("link", { name: "abare" }));
    expect(screen.getByText("Result detail")).toBeInTheDocument();
    await user.click(screen.getByText("Back"));
    expect(screen.getByTestId("url").textContent).toBe(searchUrl);
    expect(screen.getByRole("textbox")).toHaveValue("tembi'u");
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "alphabetical",
    );
    await user.click(screen.getByText("Forward"));
    expect(screen.getByText("Result detail")).toBeInTheDocument();
    await user.click(screen.getByText("Back"));
    await user.click(screen.getByText("Back"));
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "recent",
    );
    expect(
      screen.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("noun");
  });

  it("groups typing into one history step and keeps the previous completed search", async () => {
    mount("/entries?q=old");
    const user = userEvent.setup();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "new");
    await user.click(screen.getByText("Back"));
    expect(screen.getByRole("textbox")).toHaveValue("old");
    await user.click(screen.getByText("Forward"));
    expect(screen.getByRole("textbox")).toHaveValue("new");
  });

  it("keeps other query parameters and the fragment when filters change", async () => {
    mount("/entries?q=abare&utm_source=shared#results");
    await userEvent
      .setup()
      .selectOptions(
        screen.getByRole("combobox", { name: "Ordenação" }),
        "score",
      );
    expect(params().get("utm_source")).toBe("shared");
    expect(screen.getByTestId("url").textContent).toMatch(/#results$/);
  });

  it("keeps the query when switching between entries and examples", async () => {
    mount("/entries?q=tembi%27u&sort=score&part_of_speech=noun");
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Verbetes" }));
    expect(params().get("part_of_speech")).toBe("noun");
    await user.click(screen.getByRole("link", { name: "Exemplos" }));
    expect(params().get("q")).toBe("tembi'u");
    expect(params().get("sort")).toBe("score");
    expect(params().has("part_of_speech")).toBe(false);
    expect(screen.getByRole("textbox")).toHaveValue("tembi'u");
    await waitFor(() =>
      expect(listExamples).toHaveBeenCalledWith(
        expect.objectContaining({ search: "tembi'u", sort: "score" }),
      ),
    );
    await user.click(screen.getByText("Back"));
    expect(
      screen.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("noun");
  });

  it("preserves unsubmitted downvote comments privately when opening and leaving a result", async () => {
    auth.user = { id: "reader" };
    mount("/entries?q=abare");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Voto negativo" }),
    );
    const draft = screen.getByPlaceholderText(/Escreva seu/);
    await user.type(draft, "Meu comentário ainda não enviado");
    expect(draft).toHaveValue("Meu comentário ainda não enviado");
    expect(
      window.sessionStorage.getItem("nheenga:navigation:state:v1"),
    ).toContain("Meu comentário ainda não enviado");
    await user.click(screen.getByRole("link", { name: "abare" }));
    await user.click(screen.getByText("Back"));
    expect(screen.getByPlaceholderText(/Escreva seu/)).toHaveValue(
      "Meu comentário ainda não enviado",
    );
    expect(screen.getByTestId("url")).not.toHaveTextContent("comentário");
  });

  it("ignores invalid filter values and removes default values from the URL", async () => {
    mount(
      "/entries?q=abare&sort=nonsense&status=invalid&part_of_speech=invalid",
    );
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "recent",
    );
    await waitFor(() =>
      expect(listEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "",
          part_of_speech: "",
          sort: "recent",
        }),
      ),
    );
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ordenação" }),
      "score",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Ordenação" }),
      "recent",
    );
    expect(params().has("sort")).toBe(false);
    expect(params().get("q")).toBe("abare");
  });

  it("keeps the unseen link until the signed-in user has loaded", async () => {
    const view = mount("/entries?unseen=1");
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "recent",
    );
    auth.user = { id: "reader" };
    // A normal rerender must reveal the requested filter, rather than having erased it.
    view.rerender(
      <I18nProvider>
        <OrthographyProvider>
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={["/entries?unseen=1"]}>
              <EntriesPage />
            </MemoryRouter>
          </QueryClientProvider>
        </OrthographyProvider>
      </I18nProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "unseen",
    );
  });
});

describe("tab navigation state", () => {
  it("restores result depth after cached pages have been discarded", async () => {
    writeNavigationState("page:/entries:pages:results", 3);
    const fetchNextPage = vi.fn();
    function Pages({ loaded }: { loaded: number }) {
      useRestoreResultPages("results", loaded, true, false, fetchNextPage);
      return null;
    }
    const view = render(
      <MemoryRouter initialEntries={["/entries"]}>
        <Pages loaded={1} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));
    view.rerender(
      <MemoryRouter initialEntries={["/entries"]}>
        <Pages loaded={2} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(2));
    view.rerender(
      <MemoryRouter initialEntries={["/entries"]}>
        <Pages loaded={3} />
      </MemoryRouter>,
    );
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it("keeps routes isolated and works when session storage is blocked", async () => {
    const user = userEvent.setup();
    function Draft() {
      const [text, setText] = usePageState("draft", "");
      const navigate = useNavigate();
      return (
        <>
          <input
            aria-label="draft"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button onClick={() => navigate("/other")}>Other route</button>
          <button onClick={() => navigate(-1)}>Back</button>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/entries"]}>
        <Draft />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole("textbox"), "saved");
    await user.click(screen.getByText("Other route"));
    expect(screen.getByRole("textbox")).toHaveValue("");
    await user.click(screen.getByText("Back"));
    expect(screen.getByRole("textbox")).toHaveValue("saved");
    const mock = vi
      .spyOn(window.sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    await user.type(screen.getByRole("textbox"), " locally");
    expect(screen.getByRole("textbox")).toHaveValue("saved locally");
    await user.click(screen.getByText("Other route"));
    await user.click(screen.getByText("Back"));
    expect(screen.getByRole("textbox")).toHaveValue("saved locally");
    mock.mockRestore();
  });
});
