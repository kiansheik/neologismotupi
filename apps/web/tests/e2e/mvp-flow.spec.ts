import { expect, test } from "@playwright/test";

const moderator = {
  email: "e2e-moderator@example.com",
  password: "password123",
  display_name: "Moderator",
};

const contributor = {
  email: "e2e-contributor@example.com",
  password: "password123",
  display_name: "Author",
};

const voter = {
  email: "e2e-voter@example.com",
  password: "password123",
  display_name: "Voter",
};

test.describe("MVP flow", () => {
  test("signup, submit, moderate, vote, example, report", async ({ page }) => {
    const uniqueHeadword = `flow-${Date.now()}`;

    const earnVoteBalance = async (neededVotes: number) => {
      for (let index = 0; index < neededVotes; index += 1) {
        await page.goto("/entries?unseen=1");
        const firstEntry = page.getByTestId("entry-list").getByRole("link").first();
        await firstEntry.click();
        await page.getByRole("button", { name: "Voto positivo" }).click();
      }
    };

    const ensureLoggedIn = async (user: typeof moderator) => {
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(user.email);
      await page.getByLabel("Senha").fill(user.password);
      await page.getByRole("button", { name: "Entrar" }).click();

      const logoutButton = page.getByRole("button", { name: "Sair" });
      try {
        await logoutButton.waitFor({ timeout: 5000 });
        return;
      } catch {
        await page.goto("/signup");
        await page.getByLabel("Nome de exibição").fill(user.display_name);
        await page.getByLabel("E-mail").fill(user.email);
        await page.getByLabel("Senha").fill(user.password);
        await page.getByRole("button", { name: "Criar conta" }).click();
        await logoutButton.waitFor();
      }
    };

    await ensureLoggedIn(moderator);

    await page.getByRole("button", { name: "Sair" }).click();

    await ensureLoggedIn(contributor);

    await page.goto("/submit");
    await page.waitForFunction(() => {
      const hasLabel = Array.from(document.querySelectorAll("label")).some((label) =>
        label.textContent?.includes("Verbete"),
      );
      const hasCta = Array.from(document.querySelectorAll("a")).some((link) =>
        link.textContent?.includes("Ver verbetes não vistos por mim"),
      );
      const hasError = document.body.textContent?.includes("Não foi possível carregar seu saldo de votos");
      return hasLabel || hasCta || hasError;
    });

    if ((await page.getByLabel("Verbete").count()) === 0) {
      const voteCta = page.getByRole("link", { name: "Ver verbetes não vistos por mim" });
      if ((await voteCta.count()) > 0) {
        const gateText = (await page.getByText("Para enviar um verbete").first().innerText().catch(() => "")) ?? "";
        const match = gateText.match(/faltam\s+(\d+)/i);
        const neededVotes = match ? Number(match[1]) : 3;
        await voteCta.click();
        await earnVoteBalance(neededVotes);
        await page.goto("/submit");
      }
    }
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
    await ensureLoggedIn(voter);

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
