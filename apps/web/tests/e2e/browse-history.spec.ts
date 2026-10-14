import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const entries = Array.from({ length: 120 }, (_, index) => ({
  id: `entry-${index + 1}`,
  slug: `verbete-${index + 1}`,
  headword: `verbete-${index + 1}`,
  normalized_headword: `verbete-${index + 1}`,
  gloss_pt: "significado",
  gloss_en: null,
  part_of_speech: "noun",
  short_definition:
    "Definição usada para verificar a navegação pelo dicionário.",
  status: "approved",
  score_cache: 0,
  upvote_count_cache: 0,
  downvote_count_cache: 0,
  example_count_cache: 0,
  proposer_user_id: "author",
  proposer: { id: "author", display_name: "Author", reputation_score: 0 },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  tags: [],
}));

async function mockDictionary(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    let json: unknown = {};
    if (path === "/auth/me") {
      await route.fulfill({
        status: 401,
        json: { error: { code: "unauthenticated", message: "Sign in" } },
      });
      return;
    }
    if (path === "/entries/constraints")
      json = {
        downvote_requires_comment: true,
        downvote_comment_min_length: 5,
      };
    else if (path === "/entries") {
      const number = Number(url.searchParams.get("page") ?? 1);
      const size = Number(url.searchParams.get("page_size") ?? 50);
      // Async content must not cause restoration to clamp to a short loading screen.
      await new Promise((resolve) => setTimeout(resolve, 150));
      json = {
        items: entries.slice((number - 1) * size, number * size),
        page: number,
        page_size: size,
        total: entries.length,
      };
    } else if (path.startsWith("/entries/verbete-")) {
      const entry = entries.find((entry) => path === `/entries/${entry.slug}`);
      json = {
        ...entry,
        morphology_notes: null,
        source: null,
        source_citation: null,
        approved_at: null,
        approved_by_user_id: null,
        versions: [],
        history_events: [],
        examples: [],
        comments: [],
        audio_samples: [],
      };
    } else if (path === "/examples")
      json = { items: [], page: 1, page_size: 50, total: 0 };
    else if (path === "/navarro/cache") json = [];
    await route.fulfill({ json });
  });
}

test.describe("browse history with an isolated dictionary API", () => {
  test.beforeEach(async ({ page }) => {
    await mockDictionary(page);
  });

  test("Back, Forward and reload restore filters, result depth and scroll", async ({
    page,
  }) => {
    await page.goto(
      "/entries?q=tembi%27u&status=approved&part_of_speech=noun&sort=score",
    );
    await expect(
      page.getByRole("textbox", { name: "Buscar verbetes" }),
    ).toHaveValue("tembi'u");
    await expect(
      page.getByRole("link", { name: "verbete-50", exact: true }),
    ).toBeAttached();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const result = page.getByRole("link", { name: "verbete-75", exact: true });
    await expect(result).toBeAttached();
    await result.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(1000);
    const searchUrl = page.url();
    await result.click();
    await expect(
      page.getByRole("heading", { name: "verbete-75", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(searchUrl);
    await expect(result).toBeInViewport();
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - before),
      )
      .toBeLessThan(5);
    await expect(
      page.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("noun");
    await expect(page.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "score",
    );

    await page.goForward();
    await expect(
      page.getByRole("heading", { name: "verbete-75", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(result).toBeVisible();
    await page.reload();
    await expect(result).toBeInViewport();
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => window.scrollY)) - before),
      )
      .toBeLessThan(5);
  });

  test("shares searches and walks through completed searches and filter changes", async ({
    page,
    browser,
  }) => {
    await page.goto("/entries?q=old&utm_source=shared");
    const search = page.getByRole("textbox", { name: "Buscar verbetes" });
    await search.fill("a’e");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe("a'e");
    await page
      .getByRole("combobox", { name: "Todas as classes gramaticais" })
      .selectOption("pronoun");
    await page
      .getByRole("combobox", { name: "Ordenação" })
      .selectOption("alphabetical");
    const sharedUrl = page.url();
    const context = await browser.newContext();
    const shared = await context.newPage();
    await mockDictionary(shared);
    await shared.goto(sharedUrl);
    await expect(
      shared.getByRole("textbox", { name: "Buscar verbetes" }),
    ).toHaveValue("a'e");
    await expect(
      shared.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("pronoun");
    await expect(
      shared.getByRole("combobox", { name: "Ordenação" }),
    ).toHaveValue("alphabetical");
    await context.close();

    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Ordenação" })).toHaveValue(
      "recent",
    );
    await page.goBack();
    await expect(
      page.getByRole("combobox", { name: "Todas as classes gramaticais" }),
    ).toHaveValue("");
    await page.goBack();
    await expect(search).toHaveValue("old");
    await page.goForward();
    await expect(search).toHaveValue("a'e");
    await page.getByRole("link", { name: "Exemplos", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Buscar exemplos" }),
    ).toHaveValue("a'e");
  });
});
