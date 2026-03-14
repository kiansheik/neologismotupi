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
    await page.getByLabel("Nome de exibição").fill(moderator.display_name);
    await page.getByLabel("E-mail").fill(moderator.email);
    await page.getByLabel("Senha").fill(moderator.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await page.getByRole("button", { name: "Sair" }).click();

    await page.goto("/signup");
    await page.getByLabel("Nome de exibição").fill(contributor.display_name);
    await page.getByLabel("E-mail").fill(contributor.email);
    await page.getByLabel("Senha").fill(contributor.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await page.goto("/submit");
    await page.getByLabel("Verbete").fill(uniqueHeadword);
    await page.getByLabel("Glosa (PT)").fill("teste");
    await page.getByLabel("Classe gramatical").selectOption("noun");
    await page.getByLabel("Definição").fill("E2E placeholder entry");
    await page.getByRole("button", { name: "Enviar verbete" }).click();

    await expect(page.getByText("pendente")).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(moderator.email);
    await page.getByLabel("Senha").fill(moderator.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.goto("/moderation");
    await page.getByRole("button", { name: "Aprovar" }).first().click();

    await page.getByRole("button", { name: "Sair" }).click();
    await page.goto("/signup");
    await page.getByLabel("Nome de exibição").fill(voter.display_name);
    await page.getByLabel("E-mail").fill(voter.email);
    await page.getByLabel("Senha").fill(voter.password);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await page.goto("/entries");
    await page.getByRole("link", { name: uniqueHeadword }).first().click();

    await page.getByRole("button", { name: "Voto positivo" }).click();
    await page.getByLabel("Frase").fill("A fake sentence used in e2e test");
    await page.getByLabel("Tradução").fill("Uma frase fake de teste");
    await page.getByRole("button", { name: "Enviar exemplo" }).click();

    await page.getByRole("button", { name: "Denunciar verbete" }).click();
    await page.getByLabel("Motivo da denúncia").fill("Definição incompleta para este contexto.");
    await page.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(page.getByText("Denúncia enviada.")).toBeVisible();
  });
});
