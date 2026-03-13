import { expect, test } from "@playwright/test";

const runId = Date.now();

const moderator = {
  email: `mod-${runId}@example.com`,
  password: "password123",
  display_name: "Moderator",
};

const contributor = {
  email: `author-${runId}@example.com`,
  password: "password123",
  display_name: "Author",
};

const voter = {
  email: `voter-${runId}@example.com`,
  password: "password123",
  display_name: "Voter",
};

test.describe("MVP flow", () => {
  test("signup, submit, moderate, vote, example, report", async ({ page }) => {
    const uniqueHeadword = `flow-${Date.now()}`;

    await page.goto("/signup");
    await page.getByLabel("Display name").fill(moderator.display_name);
    await page.getByLabel("Email").fill(moderator.email);
    await page.getByLabel("Password").fill(moderator.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.getByRole("button", { name: "Logout" }).click();

    await page.goto("/signup");
    await page.getByLabel("Display name").fill(contributor.display_name);
    await page.getByLabel("Email").fill(contributor.email);
    await page.getByLabel("Password").fill(contributor.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.goto("/submit");
    await page.getByLabel("Headword").fill(uniqueHeadword);
    await page.getByLabel("Gloss (PT)").fill("teste");
    await page.getByLabel("Gloss (EN)").fill("test");
    await page.getByLabel("Part of speech").fill("noun");
    await page.getByLabel("Definition").fill("E2E placeholder entry");
    await page.getByRole("button", { name: "Submit entry" }).click();

    await expect(page.getByText("pending")).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await page.goto("/login");
    await page.getByLabel("Email").fill(moderator.email);
    await page.getByLabel("Password").fill(moderator.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/moderation");
    await page.getByRole("button", { name: "Approve" }).first().click();

    await page.getByRole("button", { name: "Logout" }).click();
    await page.goto("/signup");
    await page.getByLabel("Display name").fill(voter.display_name);
    await page.getByLabel("Email").fill(voter.email);
    await page.getByLabel("Password").fill(voter.password);
    await page.getByRole("button", { name: "Create account" }).click();

    await page.goto("/entries");
    await page.getByRole("link", { name: uniqueHeadword }).first().click();

    await page.getByRole("button", { name: "Upvote" }).click();
    await page.getByLabel("Sentence").fill("A fake sentence used in e2e test");
    await page.getByLabel("Translation (PT)").fill("Uma frase fake de teste");
    await page.getByRole("button", { name: "Submit example" }).click();

    await page.getByRole("button", { name: "Report entry" }).click();
    await expect(page.getByText("Report submitted.")).toBeVisible();
  });
});
